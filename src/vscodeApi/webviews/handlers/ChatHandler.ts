import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { PERMISSION_MODE_ALLOWED_TOOLS } from "@/adapters";
import { createDeepSeekProvider } from "@/deepseekApi/ProviderFactory";
import { appendProjectInstructionsToSystemPrompt, loadProjectInstructions } from "@/vscodeApi/configuration/ProjectInstructions";
import { GenerationCheckpointStore, HistoryManager, SettingsManager, SecretsManager } from "@/vscodeApi/storage";
import { GOAL_STORAGE_KEY } from "@/shared/constants";
import { logWarning } from "@/shared/logging/Logger";
import type { AppConfig, AssistantTimelineEvent, ChatMessage, Conversation, ConversationMessage, PermissionMode, StoredToolCall, ToolDefinition, ToolExecutionModes, WebviewToHandlerMessage } from "@/adapters";
import { createSystemMessage, mapReasoningEffort } from "@/adapters/deepseek/Chat";
import { BUILT_IN_TOOLS, ToolExecutor, ToolRegistry } from "@/core/tools";
import { getToolWorkspaceHost, runWithToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { createVsCodeToolWorkspace } from "@/vscodeApi/tools/VsCodeToolWorkspace";
import { buildFileContext } from "@/core/context/FileReferences";
import { ConversationState } from "@/core/chat/ConversationState";
import { GenerationCoordinator, type GenerationTask } from "@/core/chat/GenerationCoordinator";
import { PartialStreamError } from "@/core/errors/PartialStreamError";
import { buildAutoContext, buildGitReviewContext } from "./chat/FileContext";
import { StreamEventEmitter } from "./chat/StreamEventEmitter";
import { sendMessageStreaming } from "./chat/Streaming";
import { getAvailableToolMetadata } from "./chat/ToolMetadata";
import { ToolCallSession } from "./chat/toolCalls/ToolCallSession";
import type { SendMessagePayload } from "./chat/Types";

interface SaveAssistantResultOptions {
  content: string;
  timeline: AssistantTimelineEvent[];
  model: string;
  toolCalls?: StoredToolCall[];
  state: ConversationState;
  generationId: string;
  status: "completed" | "interrupted" | "error";
}

interface ParsedSlashCommand {
  name: string;
  args: string[];
}

interface GenerationRunRecord {
  generationId: string;
  conversationId: string;
  clientRequestId: string;
  state: ConversationState;
  session: ToolCallSession;
  userMessage?: ConversationMessage;
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls: StoredToolCall[];
  status: "starting" | "streaming" | "awaiting_confirmation" | "running_tool" | "interrupted" | "completed" | "error";
  eventLog: Array<Record<string, unknown>>;
  checkpointTimer?: ReturnType<typeof setTimeout>;
}

export class ChatHandler {
  private readonly conversationState: ConversationState;
  private readonly toolRegistry: ToolRegistry;
  private readonly checkpointStore = new GenerationCheckpointStore();
  private readonly coordinator: GenerationCoordinator<SendMessagePayload>;
  private readonly runs = new Map<string, GenerationRunRecord>();
  private readonly recoveredDrafts = new Map<string, Array<{ clientRequestId: string; text: string; queuedAt: number }>>();
  private selectedConversationId?: string;
  private webviewView?: vscode.WebviewView;
  private shuttingDown = false;
  private readonly lastReplayedGeneration = new WeakMap<object, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly historyManager: HistoryManager,
  ) {
    this.conversationState = new ConversationState(this.historyManager);
    this.toolRegistry = new ToolRegistry();
    for (const tool of BUILT_IN_TOOLS) {
      this.toolRegistry.register(tool);
    }

    this.coordinator = new GenerationCoordinator({
      getLimit: () => SettingsManager.load().maxConcurrentGenerations,
      run: (generationId, task, signal) => this.executeGenerationInWorkspace(generationId, task, signal),
      onStarted: (generationId, task) => {
        this.post({
          type: "generationAccepted",
          generationId,
          conversationId: task.conversationId,
          clientRequestId: task.clientRequestId,
        });
      },
      onQueued: (task, position) => {
        this.post({ type: "messageQueued", conversationId: task.conversationId, clientRequestId: task.clientRequestId, position });
        void this.checkpointQueuedConversation(task.conversationId);
      },
      onSettled: (_generationId, task) => {
        void this.checkpointQueuedConversation(task.conversationId);
      },
    });
  }

  handle(message: WebviewToHandlerMessage, webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    switch (message.type) {
      case "sendMessage":
        void this.acceptMessage({
          text: message.text,
          modelId: message.modelId,
          reasoning: message.reasoning,
          conversationId: message.conversationId,
          referencedFiles: message.referencedFiles,
          clientRequestId: message.clientRequestId,
        });
        break;
      case "steerGeneration":
        this.steerGeneration(message);
        break;
      case "cancelGeneration":
        this.cancelGeneration(message.generationId);
        break;
      case "executeToolCall":
        this.runs.get(message.generationId)?.session.handleUserAction({
          toolCallId: message.toolCallId,
          action: message.action,
          trustForSession: message.trustForSession,
        });
        break;
      case "toolCallLimitDecision":
        this.runs.get(message.generationId)?.session.handleLimitDecision(message.action);
        break;
      case "getGenerationSnapshot":
        this.postGenerationSnapshot();
        this.replaySelectedGeneration();
        break;
      case "consumeRecoveredDraft": {
        const drafts = this.recoveredDrafts.get(message.conversationId) ?? [];
        const remaining = drafts.filter((draft) => draft.clientRequestId !== message.clientRequestId);
        if (remaining.length > 0) {
          this.recoveredDrafts.set(message.conversationId, remaining);
        } else {
          this.recoveredDrafts.delete(message.conversationId);
        }
        break;
      }
      case "getAvailableTools":
        this.handleGetAvailableTools(webviewView);
        break;
      case "newConversation":
        this.conversationState.reset();
        this.selectedConversationId = undefined;
        getToolWorkspaceHost().setRootPath?.(undefined);
        webviewView.webview.postMessage({ type: "clearChat" });
        break;
      default:
        logWarning(`[ChatHandler] Unknown message: ${message.type}`);
    }
  }

  loadConversation(conversation: Conversation): void {
    this.conversationState.load(conversation);
    this.selectedConversationId = conversation.id;
    if (conversation.workspaceUri.startsWith("file:")) {
      getToolWorkspaceHost().setRootPath?.(vscode.Uri.parse(conversation.workspaceUri).fsPath);
    }
  }

  forgetConversation(id: string): boolean {
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId);
    }
    const forgotten = this.conversationState.forget(id);
    if (forgotten) {
      this.selectedConversationId = undefined;
    }
    return forgotten;
  }

  attachWebview(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
  }

  async initialize(): Promise<void> {
    const checkpoints = await this.checkpointStore.recover();
    for (const checkpoint of checkpoints) {
      if (checkpoint.queue.length > 0) {
        this.recoveredDrafts.set(checkpoint.conversationId, checkpoint.queue);
      }
      if (checkpoint.userMessage) {
        const existing = await this.historyManager.getById(checkpoint.conversationId);
        const state = new ConversationState(this.historyManager);
        if (existing) {
          state.load(existing);
        } else {
          const now = checkpoint.updatedAt;
          state.load({
            schemaVersion: 2,
            id: checkpoint.conversationId,
            title: "Recovered conversation",
            createdAt: now,
            updatedAt: now,
            messages: [],
            model: checkpoint.config?.model ?? SettingsManager.load().model,
            workspaceUri: checkpoint.workspaceUri,
          });
        }
        const existingMessages = state.getConversation()?.messages ?? [];
        const messages: ConversationMessage[] = [];
        if (!existingMessages.some((message) => message.id === checkpoint.userMessage?.id)) {
          messages.push({ ...checkpoint.userMessage, generationId: checkpoint.generationId });
        }
        if (
          !existingMessages.some((message) => message.role === "assistant" && message.generationId === checkpoint.generationId) &&
          (checkpoint.content || checkpoint.timeline.length > 0 || checkpoint.toolCalls.length > 0)
        ) {
          messages.push(state.createMessage("assistant", checkpoint.content, {
            generationId: checkpoint.generationId,
            generationStatus: "interrupted",
            timeline: checkpoint.timeline,
            toolCalls: checkpoint.toolCalls.map((tool) =>
              tool.status === "pending" || tool.status === "awaiting_confirmation" || tool.status === "running"
                ? { ...tool, status: "cancelled", result: tool.result ?? "Interrupted because VS Code closed.", requiresConfirmation: false }
                : tool,
            ),
          }));
        }
        if (messages.length > 0) {
          await state.saveMessages({ messages, model: checkpoint.config?.model ?? SettingsManager.load().model });
        }
      }
      await this.checkpointStore.delete(checkpoint.conversationId);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    for (const record of this.runs.values()) {
      record.status = "interrupted";
      record.session.cancel();
    }
    await this.coordinator.shutdown();
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    await this.checkpointStore.flush();
  }

  async prepareConversationDeletion(id: string): Promise<void> {
    this.coordinator.clearQueue(id);
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId);
      await active.completion;
    }
    await this.checkpointStore.delete(id);
  }

  private async acceptMessage(payload: SendMessagePayload, front = false): Promise<void> {
    if (this.shuttingDown) {
      this.post({ type: "streamError", error: "The extension is shutting down." });
      return;
    }
    const config = SettingsManager.load();
    const webviewView = this.webviewView;
    if (!webviewView) {
      return;
    }
    if (await this.handleSlashCommand(payload, config, webviewView)) {
      return;
    }

    await this.restoreRequestedConversation(payload.conversationId);
    let conversationId = payload.conversationId ?? this.conversationState.getActiveConversationId();
    if (!conversationId) {
      conversationId = randomUUID();
      const now = Date.now();
      this.conversationState.load({
        schemaVersion: 2,
        id: conversationId,
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        messages: [],
        model: payload.modelId || config.model,
        workspaceUri: this.historyManager.getWorkspaceUri(),
      });
      this.selectedConversationId = conversationId;
      this.post({ type: "activeConversationChanged", id: conversationId });
    }
    this.coordinator.enqueue({
      conversationId,
      clientRequestId: payload.clientRequestId,
      queuedAt: Date.now(),
      payload: { ...payload, conversationId },
    }, front);
  }

  private steerGeneration(message: Extract<WebviewToHandlerMessage, { type: "steerGeneration" }>): void {
    const active = this.coordinator.getActive(message.generationId);
    if (!active || active.task.conversationId !== message.conversationId) {
      return;
    }
    void this.acceptMessage({
      clientRequestId: message.clientRequestId,
      text: message.text,
      modelId: message.modelId,
      reasoning: message.reasoning,
      conversationId: message.conversationId,
      referencedFiles: message.referencedFiles,
    }, true).then(() => this.cancelGeneration(message.generationId));
  }

  private async executeGeneration(
    generationId: string,
    task: GenerationTask<SendMessagePayload>,
    signal: AbortSignal,
  ): Promise<void> {
    const payload = task.payload;
    const config = SettingsManager.load();
    const sourceConversation = await this.historyManager.getById(task.conversationId) ??
      (this.conversationState.getActiveConversationId() === task.conversationId ? this.conversationState.getConversation() : undefined);
    const runState = new ConversationState(this.historyManager);
    if (sourceConversation) {
      runState.load(sourceConversation);
    } else {
      const now = Date.now();
      runState.load({
        schemaVersion: 2,
        id: task.conversationId,
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        messages: [],
        model: payload.modelId || config.model,
        workspaceUri: this.historyManager.getWorkspaceUri(),
      });
    }
    const session = new ToolCallSession(new ToolExecutor(this.toolRegistry));
    const record: GenerationRunRecord = {
      generationId,
      conversationId: task.conversationId,
      clientRequestId: task.clientRequestId,
      state: runState,
      session,
      content: "",
      timeline: [],
      toolCalls: [],
      status: "starting",
      eventLog: [],
    };
    this.runs.set(generationId, record);
    const webviewView = this.createGenerationWebview(record);
    const requestedThinkingMode = payload.reasoning !== "off";
    const requestedModel = payload.modelId || config.model;
    const apiKey = await SecretsManager.getApiKey(this.context);

    if (!apiKey) {
      await webviewView.webview.postMessage({
        type: "streamError",
        error: "API key is not configured. Open Settings -> API Key.",
      });
      this.runs.delete(generationId);
      return;
    }

    const providerConfig: AppConfig = {
      ...config,
      apiKey,
      model: requestedModel,
      thinkingMode: requestedThinkingMode,
      reasoningEffort: mapReasoningEffort(payload.reasoning),
    };

    const provider = createDeepSeekProvider(providerConfig);
    const stream = new StreamEventEmitter(webviewView);

    const userMessage = runState.createMessage("user", payload.text, { generationId });
    record.userMessage = userMessage;
    const messages = await this.buildMessages(payload, config, webviewView, runState);
    await runState.saveMessages({ messages: [userMessage], model: providerConfig.model });
    this.syncSelectedConversation(runState);
    await this.checkpointRun(record, true);

    await webviewView.webview.postMessage({
      type: "addMessage",
      message: { role: "user", content: userMessage.content },
    });
    stream.showTyping();
    record.status = "streaming";

    try {
      const allTools = this.toolRegistry.getDefinitionsForAPI();
      const toolExecutionModes = getEffectiveToolExecutionModes(config.toolExecutionModes, allTools);
      const toolProviderConfig: AppConfig = {
        ...providerConfig,
        thinkingMode: true,
        reasoningEffort: providerConfig.reasoningEffort ?? "high",
      };
      const tools = getToolsForPermissionMode(config.permissionMode, allTools).filter((tool) => toolExecutionModes[tool.function.name] !== "disabled");
      appendToolAvailabilityContext(messages, config.permissionMode, tools, toolExecutionModes);
      if (tools.length > 0) {
        const result = await session.run({
          messages,
          tools,
          providerConfig: toolProviderConfig,
          webviewView,
          toolExecutionModes,
          exposeReasoning: providerConfig.thinkingMode,
          signal,
          isCancelling: () => signal.aborted,
          autoApproveMode: config.permissionMode === "auto-approve",
        });
        if (result) {
          await this.saveAssistantResult({
            content: result.content,
            timeline: result.timeline,
            model: toolProviderConfig.model,
            toolCalls: result.toolCalls as StoredToolCall[] | undefined,
            webviewView,
            state: runState,
            generationId,
            status: signal.aborted || result.partial ? "interrupted" : "completed",
          });
        }
      } else {
        const result = await sendMessageStreaming({
          messages,
          payload,
          config,
          provider,
          webviewView,
          signal,
        });
        await this.saveAssistantResult({
          content: result.content,
          timeline: result.timeline,
          model: providerConfig.model,
          webviewView,
          state: runState,
          generationId,
          status: "completed",
        });
      }
    } catch (err: unknown) {
      if (err instanceof PartialStreamError) {
        await this.saveAssistantResult({
          content: err.partial.content,
          timeline: err.partial.timeline,
          model: providerConfig.model,
          webviewView,
          state: runState,
          generationId,
          status: "interrupted",
        });
        stream.done({ cancelled: true });
        return;
      }

      this.handleSendError(err, stream);
      record.status = isCancellationError(err) ? "interrupted" : "error";
      if (!isCancellationError(err)) {
        await runState.saveMessages({
          messages: [runState.createMessage("error", getErrorMessage(err), { generationId, generationStatus: "error" })],
          model: providerConfig.model,
        });
      }
    } finally {
      if (
        signal.aborted &&
        !runState.getConversation()?.messages.some((message) => message.role === "assistant" && message.generationId === generationId)
      ) {
        await runState.saveMessages({
          messages: [runState.createMessage("assistant", "", {
            generationId,
            generationStatus: "interrupted",
            timeline: record.timeline,
            toolCalls: record.toolCalls,
          })],
          model: providerConfig.model,
        });
        this.syncSelectedConversation(runState);
      }
      if (signal.aborted && !record.eventLog.some((event) => event.type === "streamDone")) {
        stream.done({ cancelled: true });
      }
      if (record.checkpointTimer) {
        clearTimeout(record.checkpointTimer);
      }
      await this.checkpointRun(record, true);
      if ((record.status as string) === "completed") {
        await this.checkpointStore.delete(record.conversationId);
      }
      this.runs.delete(generationId);
    }
  }

  private async executeGenerationInWorkspace(
    generationId: string,
    task: GenerationTask<SendMessagePayload>,
    signal: AbortSignal,
  ): Promise<void> {
    const conversation = await this.historyManager.getById(task.conversationId) ??
      (this.conversationState.getActiveConversationId() === task.conversationId ? this.conversationState.getConversation() : undefined);
    const workspace = createVsCodeToolWorkspace();
    const workspaceUri = conversation?.workspaceUri;
    if (workspaceUri?.startsWith("file:")) {
      workspace.setRootPath?.(vscode.Uri.parse(workspaceUri).fsPath);
    } else {
      workspace.setRootPath?.(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    }
    try {
      await runWithToolWorkspaceHost(workspace, () => this.executeGeneration(generationId, task, signal));
    } catch (error: unknown) {
      const record = this.runs.get(generationId);
      if (record) {
        record.status = signal.aborted ? "interrupted" : "error";
        this.handleGenerationEvent(record, { type: "streamError", error: getErrorMessage(error) });
        await this.checkpointRun(record, true).catch(() => undefined);
        this.runs.delete(generationId);
      }
    }
  }

  private async buildMessages(
    payload: SendMessagePayload,
    config: AppConfig,
    webviewView: vscode.WebviewView,
    state: ConversationState = this.conversationState,
  ): Promise<ChatMessage[]> {
    const contextBlocks: string[] = [];
    if (payload.referencedFiles?.length) {
      contextBlocks.push(buildFileContext(payload.referencedFiles));
    }

    if (config.autoContext) {
      const explicitContextLength = contextBlocks.join("\n\n").length;
      const autoContext = await buildAutoContext(explicitContextLength);
      if (autoContext) {
        contextBlocks.push(autoContext);
      }
    }

    const userContent = contextBlocks.length
      ? `${contextBlocks.join("\n\n")}

---

${payload.text}`
      : payload.text;

    const projectInstructions = await loadProjectInstructions();
    webviewView.webview.postMessage({
      type: "projectInstructionsStatus",
      sources: projectInstructions.sources,
      homeAgentsAllowed: projectInstructions.homeAgentsAllowed,
    });

    const systemMessage = createSystemMessage();
    return [
      {
        ...systemMessage,
        content: appendProjectInstructionsToSystemPrompt(systemMessage.content ?? "", projectInstructions.content),
      },
      ...state.getApiMessages(),
      { role: "user", content: userContent },
    ];
  }

  private async handleSlashCommand(payload: SendMessagePayload, config: AppConfig, webviewView: vscode.WebviewView): Promise<boolean> {
    const command = parseSlashCommand(payload.text);
    if (!command) {
      return false;
    }

    switch (command.name) {
      case "status":
        await this.postCommandTurn(webviewView, payload.text, await this.buildStatusMessage(config));
        return true;
      case "tools":
        this.postCommandTurn(webviewView, payload.text, this.buildToolsMessage(config));
        return true;
      case "mode":
        await this.handleModeCommand(command.args, payload.text, webviewView);
        return true;
      case "auto-context":
        await this.handleAutoContextCommand(command.args, payload.text, webviewView);
        return true;
      case "review":
        this.postCommandTurn(webviewView, payload.text, await buildGitReviewContext());
        return true;
      case "goal":
        await this.handleGoalCommand(command.args, payload.text, webviewView);
        return true;
      case "summarize":
        this.postCommandTurn(webviewView, payload.text, this.buildConversationSummary());
        return true;
      case "context":
        await this.postCommandTurn(webviewView, payload.text, await this.buildContextOverview(payload, config));
        return true;
      case "clear-context":
        this.conversationState.reset();
        webviewView.webview.postMessage({ type: "clearChat" });
        this.postCommandTurn(webviewView, payload.text, "Conversation context cleared.");
        return true;
      default:
        this.postCommandTurn(
          webviewView,
          payload.text,
          `Unknown command: /${command.name}\n\nAvailable commands: /status, /context, /review, /goal [text], /tools, /mode chat|read-only|workspace|full-access|auto-approve, /auto-context on|off, /clear-context, /summarize.`,
        );
        return true;
    }
  }

  private async buildStatusMessage(config: AppConfig): Promise<string> {
    const apiKey = await SecretsManager.getApiKey(this.context);
    const tools = this.getEnabledTools(config);
    const thinkingMode = config.thinkingMode ? "on" : "off";
    return [
      "Status",
      `- API key: ${apiKey ? "configured" : "missing"}`,
      `- Model: ${config.model}`,
      `- Thinking mode: ${thinkingMode}`,
      `- Permission mode: ${config.permissionMode}`,
      `- Auto context: ${config.autoContext ? "on" : "off"}`,
      `- Tools available: ${config.thinkingMode ? tools.length : "0 (thinking mode required)"}`,
    ].join("\n");
  }

  private buildToolsMessage(config: AppConfig): string {
    const allTools = this.toolRegistry.getDefinitionsForAPI();
    const enabledTools = new Set((config.thinkingMode ? this.getEnabledTools(config) : []).map((tool) => tool.function.name));
    const toolExecutionModes = getEffectiveToolExecutionModes(config.toolExecutionModes, allTools);
    const lines = allTools.map((tool) => {
      const name = tool.function.name;
      const availability = config.thinkingMode ? (enabledTools.has(name) ? toolExecutionModes[name] : "unavailable") : "unavailable (thinking mode required)";
      return `- ${name}: ${availability}`;
    });

    return [`Tools for mode '${config.permissionMode}'`, ...lines].join("\n");
  }

  private async handleModeCommand(args: string[], rawText: string, webviewView: vscode.WebviewView): Promise<void> {
    const mode = normalizePermissionMode(args[0]);
    if (!isPermissionMode(mode)) {
      this.postCommandTurn(webviewView, rawText, "Usage: /mode chat|read|read-only|workspace|full|full-access|auto-approve");
      return;
    }

    await SettingsManager.save({ permissionMode: mode });
    await this.postConfigLoaded(webviewView);
    this.postCommandTurn(webviewView, rawText, `Permission mode set to '${mode}'.`);
  }

  private async handleAutoContextCommand(args: string[], rawText: string, webviewView: vscode.WebviewView): Promise<void> {
    const value = args[0];
    if (value !== "on" && value !== "off") {
      this.postCommandTurn(webviewView, rawText, "Usage: /auto-context on|off");
      return;
    }

    const enabled = value === "on";
    await SettingsManager.save({ autoContext: enabled });
    await this.postConfigLoaded(webviewView);
    this.postCommandTurn(webviewView, rawText, `Auto context ${enabled ? "enabled" : "disabled"}.`);
  }

  private async handleGoalCommand(args: string[], rawText: string, webviewView: vscode.WebviewView): Promise<void> {
    const goal = args.join(" ").trim();
    if (goal.length > 0) {
      await this.context.workspaceState.update(GOAL_STORAGE_KEY, goal);
      this.postCommandTurn(webviewView, rawText, `Goal set:\n${goal}`);
      return;
    }

    const currentGoal = this.context.workspaceState.get<string>(GOAL_STORAGE_KEY);
    this.postCommandTurn(webviewView, rawText, currentGoal ? `Current goal:\n${currentGoal}` : "No goal is set.");
  }

  private buildConversationSummary(): string {
    const messages = this.conversationState.getApiMessages().filter((message) => message.role !== "system");
    if (messages.length === 0) {
      return "No conversation context to summarize.";
    }

    const recent = messages.slice(-6).map((message) => {
      const content = typeof message.content === "string" ? message.content.replace(/\s+/g, " ").trim() : "";
      return `- ${message.role}: ${content.slice(0, 220)}${content.length > 220 ? "..." : ""}`;
    });

    return [`Conversation summary (${messages.length} context messages):`, ...recent].join("\n");
  }

  private async postConfigLoaded(webviewView: vscode.WebviewView): Promise<void> {
    const freshConfig = SettingsManager.load();
    const apiKey = await SecretsManager.getApiKey(this.context);
    webviewView.webview.postMessage({
      type: "configLoaded",
      config: { ...freshConfig, apiKey: apiKey || "" },
    });
  }

  private postCommandTurn(webviewView: vscode.WebviewView, userText: string, assistantText: string): void {
    webviewView.webview.postMessage({
      type: "addMessage",
      message: { role: "user", content: userText },
    });
    webviewView.webview.postMessage({
      type: "addMessage",
      message: {
        role: "assistant",
        content: assistantText,
        timeline: [{ id: `command-${Date.now()}`, type: "content", content: assistantText }],
      },
    });
  }

  private getEnabledTools(config: AppConfig): ToolDefinition[] {
    const allTools = this.toolRegistry.getDefinitionsForAPI();
    const toolExecutionModes = getEffectiveToolExecutionModes(config.toolExecutionModes, allTools);
    return getToolsForPermissionMode(config.permissionMode, allTools).filter((tool) => toolExecutionModes[tool.function.name] !== "disabled");
  }

  private async saveAssistantResult({
    content,
    timeline,
    model,
    toolCalls,
    webviewView,
    state,
    generationId,
    status,
  }: SaveAssistantResultOptions & { webviewView: vscode.WebviewView }): Promise<void> {
    await state.saveMessages({
      messages: [state.createMessage("assistant", content, {
        timeline,
        toolCalls,
        generationId,
        generationStatus: status,
      })],
      model,
    });
    const record = this.runs.get(generationId);
    if (record) {
      record.content = content;
      record.timeline = timeline;
      record.toolCalls = toolCalls ?? [];
      record.status = status;
    }
    this.syncSelectedConversation(state);
    const id = state.getActiveConversationId();
    if (id) {
      await webviewView.webview.postMessage({ type: "activeConversationChanged", id });
    }
  }

  private async restoreRequestedConversation(conversationId: string | undefined): Promise<void> {
    if (!conversationId || this.conversationState.getActiveConversationId() === conversationId) {
      return;
    }
    const conversation = await this.historyManager.getById(conversationId);
    if (conversation) {
      this.loadConversation(conversation);
    } else {
      this.conversationState.reset();
    }
  }

  private handleSendError(err: unknown, stream: StreamEventEmitter): void {
    if (isCancellationError(err)) {
      stream.done({ cancelled: true });
      return;
    }

    stream.error(getErrorMessage(err));
  }

  private cancelGeneration(generationId: string): void {
    const record = this.runs.get(generationId);
    if (!record) {
      return;
    }
    record.status = "interrupted";
    record.session.cancel();
    this.coordinator.interrupt(generationId);
  }

  private handleGetAvailableTools(webviewView: vscode.WebviewView): void {
    webviewView.webview.postMessage({
      type: "availableTools",
      tools: getAvailableToolMetadata(this.toolRegistry.getDefinitionsForAPI()),
    });
  }

  private async buildContextOverview(payload: SendMessagePayload, config: AppConfig): Promise<string> {
    const instructions = await loadProjectInstructions();
    const files = payload.referencedFiles?.map((file) => `- ${file.path}${file.content === undefined ? " (content omitted)" : ""}`) ?? [];
    return [
      "Context that would be sent with a normal request:",
      `- Prior API messages after pruning: ${this.conversationState.getApiMessages().length}`,
      `- Auto context: ${config.autoContext ? "active editor plus staged/unstaged Git changes" : "disabled"}`,
      `- Project instructions: ${instructions.sources.length > 0 ? instructions.sources.map((source) => source.path).join(", ") : "none"}`,
      `- Explicit references: ${files.length}`,
      ...files,
    ].join("\n");
  }

  private createGenerationWebview(record: GenerationRunRecord): vscode.WebviewView {
    return {
      webview: {
        postMessage: async (message: unknown) => {
          this.handleGenerationEvent(record, message);
          return true;
        },
      },
    } as unknown as vscode.WebviewView;
  }

  private handleGenerationEvent(record: GenerationRunRecord, value: unknown): void {
    if (!value || typeof value !== "object") {
      return;
    }
    const message: Record<string, unknown> = {
      ...(value as Record<string, unknown>),
      generationId: record.generationId,
      conversationId: record.conversationId,
    };
    const type = typeof message.type === "string" ? message.type : "";
    if (type === "streamTimelineDelta" && typeof message.content === "string" && typeof message.eventId === "string") {
      record.content += message.eventType === "content" ? message.content : "";
      const existing = record.timeline.find((event) => event.id === message.eventId);
      if (existing && (existing.type === "content" || existing.type === "reasoning")) {
        existing.content += message.content;
      } else if (message.eventType === "content" || message.eventType === "reasoning") {
        record.timeline.push({ id: message.eventId, type: message.eventType, content: message.content });
      }
      record.status = "streaming";
      this.scheduleCheckpoint(record);
    } else if (type === "streamTimelineToolGroup" && message.event && typeof message.event === "object") {
      record.timeline.push(structuredClone(message.event) as AssistantTimelineEvent);
      record.status = "running_tool";
      void this.checkpointRun(record, true);
    } else if (type === "toolCallConfirmationRequired") {
      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls as Array<{ id: string; function: { name: string; arguments: string } }> : [];
      for (const toolCall of toolCalls) {
        upsertStoredToolCall(record.toolCalls, {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments,
          status: "awaiting_confirmation",
          requiresConfirmation: true,
          round: typeof message.round === "number" ? message.round : undefined,
        });
      }
      record.status = "awaiting_confirmation";
      void this.checkpointRun(record, true);
    } else if (type === "toolCallStarted") {
      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls as Array<{ id: string; function: { name: string; arguments: string } }> : [];
      for (const toolCall of toolCalls) {
        upsertStoredToolCall(record.toolCalls, {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments,
          status: "running",
          round: typeof message.round === "number" ? message.round : undefined,
        });
      }
      record.status = "running_tool";
      void this.checkpointRun(record, true);
    } else if (type === "toolCallResult" && typeof message.toolCallId === "string") {
      const existing = record.toolCalls.find((tool) => tool.toolCallId === message.toolCallId);
      if (existing) {
        existing.status = isStoredToolStatus(message.status) ? message.status : "error";
        existing.result = typeof message.result === "string" ? message.result : "";
        existing.isError = message.isError === true;
        existing.requiresConfirmation = false;
      }
      record.status = "running_tool";
      void this.checkpointRun(record, true);
    } else if (type === "toolCallActionAccepted" && typeof message.toolCallId === "string") {
      const existing = record.toolCalls.find((tool) => tool.toolCallId === message.toolCallId);
      if (existing && (message.status === "running" || message.status === "rejected")) {
        existing.status = message.status;
        existing.requiresConfirmation = false;
      }
      record.status = "running_tool";
      void this.checkpointRun(record, true);
    } else if (type === "addMessage") {
      const added = message.message as { toolCalls?: StoredToolCall[] } | undefined;
      if (added?.toolCalls) {
        record.toolCalls = structuredClone(added.toolCalls);
      }
    } else if (type === "streamError") {
      record.status = "error";
    }

    record.eventLog.push(message);
    if (this.selectedConversationId === record.conversationId) {
      void this.webviewView?.webview.postMessage(message);
    }
  }

  private scheduleCheckpoint(record: GenerationRunRecord): void {
    if (record.checkpointTimer) {
      return;
    }
    record.checkpointTimer = setTimeout(() => {
      record.checkpointTimer = undefined;
      void this.checkpointRun(record, false);
    }, 500);
  }

  private async checkpointRun(record: GenerationRunRecord, immediate: boolean): Promise<void> {
    if (immediate && record.checkpointTimer) {
      clearTimeout(record.checkpointTimer);
      record.checkpointTimer = undefined;
    }
    const config = SettingsManager.load();
    const { apiKey: _apiKey, ...safeConfig } = config;
    await this.checkpointStore.save({
      conversationId: record.conversationId,
      generationId: record.generationId,
      status: record.status,
      userMessage: record.userMessage,
      content: record.content,
      timeline: structuredClone(record.timeline),
      toolCalls: structuredClone(record.toolCalls),
      queue: this.coordinator.getQueue(record.conversationId).map((task) => ({
        clientRequestId: task.clientRequestId,
        text: task.payload.text,
        queuedAt: task.queuedAt,
      })),
      config: safeConfig,
      workspaceUri: record.state.getConversation()?.workspaceUri ?? this.historyManager.getWorkspaceUri(),
      updatedAt: Date.now(),
    });
  }

  private async checkpointQueuedConversation(conversationId: string): Promise<void> {
    const active = this.coordinator.getActiveForConversation(conversationId);
    const record = active ? this.runs.get(active.generationId) : undefined;
    if (record) {
      await this.checkpointRun(record, true);
      return;
    }
    const queue = this.coordinator.getQueue(conversationId);
    if (queue.length === 0) {
      return;
    }
    await this.checkpointStore.save({
      conversationId,
      status: "queued",
      content: "",
      timeline: [],
      toolCalls: [],
      queue: queue.map((task) => ({ clientRequestId: task.clientRequestId, text: task.payload.text, queuedAt: task.queuedAt })),
      workspaceUri: this.historyManager.getWorkspaceUri(),
      updatedAt: Date.now(),
    });
  }

  private postGenerationSnapshot(): void {
    this.post({
      type: "generationSnapshot",
      generations: [...this.runs.values()].map((record) => ({
        generationId: record.generationId,
        conversationId: record.conversationId,
        status: record.status,
        userMessage: record.userMessage ?? record.state.createMessage("user", ""),
        content: record.content,
        timeline: structuredClone(record.timeline),
        toolCalls: structuredClone(record.toolCalls),
        queue: this.coordinator.getQueue(record.conversationId).map((task) => ({
          clientRequestId: task.clientRequestId,
          text: task.payload.text,
          queuedAt: task.queuedAt,
        })),
      })),
      recoveredDrafts: [...this.recoveredDrafts].map(([conversationId, messages]) => ({ conversationId, messages })),
    });
  }

  private replaySelectedGeneration(): void {
    const webviewView = this.webviewView;
    if (!webviewView) {
      return;
    }
    const active = this.selectedConversationId ? this.coordinator.getActiveForConversation(this.selectedConversationId) : undefined;
    const record = active ? this.runs.get(active.generationId) : undefined;
    if (!record) {
      return;
    }
    if (this.lastReplayedGeneration.get(webviewView) === record.generationId) {
      return;
    }
    this.lastReplayedGeneration.set(webviewView, record.generationId);
    for (const event of record.eventLog) {
      const type = event.type;
      if (
        type === "toolCallStarted" ||
        type === "toolCallConfirmationRequired" ||
        type === "toolCallResult" ||
        type === "toolCallActionAccepted" ||
        type === "toolCallLimitReached"
      ) {
        void webviewView.webview.postMessage(event);
      }
    }
  }

  private syncSelectedConversation(state: ConversationState): void {
    if (state.getActiveConversationId() === this.selectedConversationId) {
      const conversation = state.getConversation();
      if (conversation) {
        this.conversationState.load(conversation);
      }
    }
  }

  private post(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }

}

export default ChatHandler;

function isCancellationError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "Canceled");
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error while connecting to the API";
}

function getEffectiveToolExecutionModes(savedModes: ToolExecutionModes | undefined, tools: ToolDefinition[]): ToolExecutionModes {
  return Object.fromEntries(tools.map((tool) => [tool.function.name, savedModes?.[tool.function.name] ?? "enabled"]));
}

function getToolsForPermissionMode(permissionMode: PermissionMode, tools: ToolDefinition[]): ToolDefinition[] {
  const allowedToolNames = PERMISSION_MODE_ALLOWED_TOOLS[permissionMode];
  if (allowedToolNames === null) {
    return tools;
  }

  return tools.filter((tool) => allowedToolNames.includes(tool.function.name));
}

function appendToolAvailabilityContext(messages: ChatMessage[], permissionMode: PermissionMode, tools: ToolDefinition[], executionModes: ToolExecutionModes): void {
  const systemMessage = messages.find((message) => message.role === "system");
  if (!systemMessage) {
    return;
  }

  const availableToolNames = tools.map((tool) => tool.function.name);
  const delegatedTools = permissionMode === "auto-approve"
    ? tools.filter((tool) => executionModes[tool.function.name] !== "disabled").map((tool) => tool.function.name)
    : [];
  const capabilityNotice =
    permissionMode === "read-only"
      ? "This mode cannot create or modify files and cannot execute terminal commands. If the request requires those capabilities, explain the limitation immediately. Do not inspect the workspace first unless that inspection directly helps answer the request."
      : permissionMode === "chat"
        ? "No workspace tools are available. If the request requires workspace access or changes, explain the limitation immediately."
        : "Use only the tools listed below and do not imply that unavailable capabilities can be used.";

  const delegationNotice = delegatedTools.length > 0
    ? `\n- Auto-approved tools: ${delegatedTools.join(", ")}. The user explicitly delegated these approvals. Each call executes immediately, so call them only when necessary, directly aligned with the request, and with the narrowest safe arguments.`
    : "";
  systemMessage.content = `${systemMessage.content ?? ""}\n\nRuntime permissions:\n- Permission mode: ${permissionMode}\n- Available tools: ${availableToolNames.length > 0 ? availableToolNames.join(", ") : "none"}${delegationNotice}\n- ${capabilityNotice}`;
}

function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [rawName, ...args] = trimmed.slice(1).split(/\s+/).filter(Boolean);
  return {
    name: (rawName || "").toLowerCase(),
    args,
  };
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "chat" || value === "read-only" || value === "workspace" || value === "full-access" || value === "auto-approve";
}

function normalizePermissionMode(value: string | undefined): string | undefined {
  if (value === "read") {
    return "read-only";
  }
  if (value === "full") {
    return "full-access";
  }
  return value;
}

function upsertStoredToolCall(toolCalls: StoredToolCall[], value: StoredToolCall): void {
  const index = toolCalls.findIndex((toolCall) => toolCall.toolCallId === value.toolCallId);
  if (index >= 0) {
    toolCalls[index] = { ...toolCalls[index], ...value };
  } else {
    toolCalls.push(value);
  }
}

function isStoredToolStatus(value: unknown): value is StoredToolCall["status"] {
  return value === "pending" ||
    value === "awaiting_confirmation" ||
    value === "running" ||
    value === "completed" ||
    value === "rejected" ||
    value === "cancelled" ||
    value === "error";
}
