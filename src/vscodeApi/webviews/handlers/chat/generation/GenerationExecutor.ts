import * as vscode from "vscode";
import type {
  AppConfig,
  AssistantTimelineEvent,
  PermissionSnapshot,
  StoredToolCall,
} from "@/adapters";
import { mapReasoningEffort } from "@/adapters/deepseek/Chat";
import { ConversationState } from "@/core/chat/ConversationState";
import type { GenerationTask } from "@/core/chat/GenerationCoordinator";
import {
  createProviderTranscript,
  type ProviderTranscript,
} from "@/core/chat/ProviderTranscript";
import { PartialStreamError } from "@/core/errors/PartialStreamError";
import { ToolExecutor, type ToolRegistry } from "@/core/tools";
import { runWithToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { createDeepSeekProvider } from "@/deepseekApi/ProviderFactory";
import {
  aggregateUsageAggregates,
  checkUsageBudgets,
  createUsageAggregate,
  formatUsageSummary,
  isOfficialDeepSeekEndpoint,
  recordUsage,
  type ProviderUsage,
  type UsageAggregate,
} from "@/shared/usage/Usage";
import { logInfo, logWarning } from "@/shared/logging/Logger";
import type {
  GenerationCheckpointStore,
  HistoryManager,
} from "@/vscodeApi/storage";
import { SettingsManager, SecretsManager } from "@/vscodeApi/storage";
import { createVsCodeToolWorkspace } from "@/vscodeApi/tools/VsCodeToolWorkspace";
import { extractHttpsUrls } from "@/vscodeApi/tools/browser/NetworkPolicy";
import {
  captureWorkspaceRunSnapshot,
  createLegacyWorkspaceBinding,
  type WorkspaceRunSnapshot,
} from "@/vscodeApi/workspace";
import { StreamEventEmitter } from "../StreamEventEmitter";
import { sendMessageStreaming } from "../Streaming";
import type { SendMessagePayload } from "../Types";
import type { DangerTrustStore } from "../toolCalls/DangerTrustStore";
import { ToolCallSession } from "../toolCalls/ToolCallSession";
import {
  appendToolAvailabilityContext,
  getEffectiveToolExecutionModes,
  getErrorMessage,
  isCancellationError,
  normalizeWorkspaceUri,
} from "../ChatHandlerSupport";
import {
  buildGenerationMessages,
  fitGenerationRequestContext,
} from "./GenerationContext";
import {
  createGenerationWebview,
  handleGenerationEvent,
  type GenerationEventCallbacks,
  type GenerationRunRecord,
} from "./GenerationRun";

interface SaveAssistantResultOptions {
  content: string;
  timeline: AssistantTimelineEvent[];
  model: string;
  toolCalls?: StoredToolCall[];
  state: ConversationState;
  generationId: string;
  status: "completed" | "interrupted" | "error";
  providerTranscript?: ProviderTranscript;
  usage?: UsageAggregate;
  webviewView: vscode.WebviewView;
}

interface GenerationExecutorDependencies {
  context: vscode.ExtensionContext;
  historyManager: HistoryManager;
  activeConversationState: ConversationState;
  toolRegistry: ToolRegistry;
  dangerTrustStore: DangerTrustStore;
  checkpointStore: GenerationCheckpointStore;
  runs: Map<string, GenerationRunRecord>;
  generationEventCallbacks: GenerationEventCallbacks;
  checkpoint: (record: GenerationRunRecord, immediate: boolean) => Promise<void>;
  scheduleCheckpoint: (record: GenerationRunRecord) => void;
  syncSelectedConversation: (state: ConversationState) => void;
  post: (message: Record<string, unknown>) => void;
}

export class GenerationExecutor {
  constructor(private readonly dependencies: GenerationExecutorDependencies) {}

  async executeInWorkspace(
    generationId: string,
    task: GenerationTask<SendMessagePayload>,
    signal: AbortSignal,
  ): Promise<void> {
    const { activeConversationState, historyManager } = this.dependencies;
    const conversation = await historyManager.getById(task.conversationId) ??
      (
        activeConversationState.getActiveConversationId() === task.conversationId
          ? activeConversationState.getConversation()
          : undefined
      );

    if (signal.aborted) {
      this.dependencies.post({
        type: "streamDone",
        generationId,
        conversationId: task.conversationId,
        cancelled: true,
      });
      return;
    }

    try {
      const binding = conversation?.workspaceBinding ??
        createLegacyWorkspaceBinding(conversation?.workspaceUri ?? "workspace:unknown");
      const workspaceSnapshot = captureWorkspaceRunSnapshot(binding);
      const permissionSnapshot = await SettingsManager.capturePermissionSnapshot(
        vscode.workspace.isTrusted,
      );
      const workspace = createVsCodeToolWorkspace(workspaceSnapshot, {
        allowOutsideWorkspace: true,
        unrestricted: permissionSnapshot.permissionMode === "full-access",
      });
      await runWithToolWorkspaceHost(
        workspace,
        () => this.execute(generationId, task, signal, workspaceSnapshot, permissionSnapshot),
      );
    } catch (error: unknown) {
      const record = this.dependencies.runs.get(generationId);
      if (record) {
        record.status = signal.aborted ? "interrupted" : "error";
        handleGenerationEvent(
          record,
          { type: "streamError", error: getErrorMessage(error) },
          this.dependencies.generationEventCallbacks,
        );
        await this.dependencies.checkpoint(record, true).catch(() => undefined);
        this.dependencies.runs.delete(generationId);
      } else {
        this.dependencies.post({
          type: "streamError",
          generationId,
          conversationId: task.conversationId,
          error: getErrorMessage(error),
        });
      }
    }
  }

  private async execute(
    generationId: string,
    task: GenerationTask<SendMessagePayload>,
    signal: AbortSignal,
    workspaceSnapshot: WorkspaceRunSnapshot,
    initialPermissionSnapshot: PermissionSnapshot,
  ): Promise<void> {
    const {
      activeConversationState,
      checkpointStore,
      context,
      dangerTrustStore,
      historyManager,
      runs,
      toolRegistry,
    } = this.dependencies;
    const payload = task.payload;
    const config = SettingsManager.load();
    const sourceConversation = await historyManager.getById(task.conversationId) ??
      (
        activeConversationState.getActiveConversationId() === task.conversationId
          ? activeConversationState.getConversation()
          : undefined
      );
    const selectedMode = activeConversationState.getActiveConversationId() === task.conversationId
      ? activeConversationState.getPersistenceMode()
      : undefined;
    const runState = new ConversationState(
      historyManager,
      selectedMode ?? (config.historyEnabled ? "persistent" : "incognito"),
    );
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
        workspaceUri: workspaceSnapshot.binding.uri,
        workspaceBinding: workspaceSnapshot.binding,
      });
    }

    const session = new ToolCallSession(new ToolExecutor(toolRegistry), dangerTrustStore);
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
      permissionSnapshot: initialPermissionSnapshot,
    };
    runs.set(generationId, record);
    const webviewView = createGenerationWebview(
      record,
      this.dependencies.generationEventCallbacks,
    );
    const requestedThinkingMode = payload.reasoning !== "off";
    const requestedModel = payload.modelId || config.model;
    const apiKey = await SecretsManager.getApiKey(context, config.baseUrl);

    if (!apiKey) {
      await webviewView.webview.postMessage({
        type: "streamError",
        error: "API key is not configured. Open Settings -> API Key.",
      });
      runs.delete(generationId);
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
    const usageAggregate = createUsageAggregate(isOfficialDeepSeekEndpoint(providerConfig.baseUrl), providerConfig.model);
    const recordPrimaryUsage = (usage: ProviderUsage | undefined): void => {
      recordUsage(usageAggregate, "primary", usage);
    };
    const stream = new StreamEventEmitter(webviewView);
    const userMessage = runState.createMessage("user", payload.text, { generationId });
    record.userMessage = userMessage;
    let messages = await buildGenerationMessages({
      payload,
      config,
      webviewView,
      state: runState,
      workspaceSnapshot,
      excludedGenerationId: generationId,
    });
    await runState.saveMessages({ messages: [userMessage], model: providerConfig.model });
    this.dependencies.syncSelectedConversation(runState);
    await this.dependencies.checkpoint(record, true);

    await webviewView.webview.postMessage({
      type: "addMessage",
      message: { role: "user", content: userMessage.content },
    });
    stream.showTyping();
    record.status = "streaming";

    try {
      const allTools = toolRegistry.getDefinitionsForAPI();
      const toolExecutionModes = getEffectiveToolExecutionModes(
        initialPermissionSnapshot.toolExecutionModes,
        allTools,
        initialPermissionSnapshot.permissionMode,
      );
      const toolProviderConfig: AppConfig = {
        ...providerConfig,
        thinkingMode: true,
        reasoningEffort: providerConfig.reasoningEffort ?? "high",
      };
      const workspaceTools = allTools.filter((tool) => {
        const registered = toolRegistry.get(tool.function.name);
        if (registered?.metadata.scope === "global") {
          return true;
        }
        if (!workspaceSnapshot.binding.capabilities.files) {
          return false;
        }
        return tool.function.name !== "run_terminal_command" ||
          workspaceSnapshot.binding.capabilities.terminal;
      });
      const tools = workspaceTools.filter(
        (tool) => toolExecutionModes[tool.function.name] !== "disabled",
      );
      appendToolAvailabilityContext(
        messages,
        initialPermissionSnapshot.permissionMode,
        tools,
        toolExecutionModes,
        workspaceSnapshot,
      );
      messages = await fitGenerationRequestContext({
        messages,
        payload,
        config: providerConfig,
        provider,
        state: runState,
        webviewView,
        workspaceSnapshot,
        generationId,
        record,
        tools,
        permissionMode: initialPermissionSnapshot.permissionMode,
        enabledTools: tools,
        toolExecutionModes,
        signal,
        checkpoint: (run) => this.dependencies.checkpoint(run, true),
        onUsage: (phase, usage) => recordUsage(usageAggregate, phase, usage),
      });

      if (tools.length > 0) {
        const result = await session.run({
          messages,
          tools: workspaceTools,
          providerConfig: toolProviderConfig,
          webviewView,
          permissionSnapshot: initialPermissionSnapshot,
          capturePermissionSnapshot: () =>
            SettingsManager.capturePermissionSnapshot(vscode.workspace.isTrusted),
          onPermissionSnapshot: (snapshot) => {
            record.permissionSnapshot = snapshot;
            this.dependencies.scheduleCheckpoint(record);
          },
          onUsage: (phase, usage) => recordUsage(usageAggregate, phase, usage),
          onTranscriptUpdate: (transcript) => {
            record.providerTranscript = transcript;
            void this.dependencies.checkpoint(record, true);
          },
          exposeReasoning: providerConfig.thinkingMode,
          signal,
          isCancelling: () => signal.aborted,
          isWorkspaceTrusted: () => vscode.workspace.isTrusted,
          generationId,
          trustedUserRequest: payload.text,
          authorizedUserUrls: extractHttpsUrls(payload.text),
          trustScope: {
            conversationId: task.conversationId,
            workspaceUri: normalizeWorkspaceUri(workspaceSnapshot.binding.uri),
            configFingerprint: initialPermissionSnapshot.fingerprint,
          },
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
            providerTranscript: result.providerTranscript,
            usage: usageAggregate,
          });
        }
      } else {
        const result = await sendMessageStreaming({
          onUsage: recordPrimaryUsage,
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
          usage: usageAggregate,
          providerTranscript: createProviderTranscript([{
            role: "assistant",
            content: result.content,
          }], "complete"),
        });
      }
    } catch (error: unknown) {
      if (error instanceof PartialStreamError) {
        await this.saveAssistantResult({
          content: error.partial.content,
          timeline: error.partial.timeline,
          model: providerConfig.model,
          webviewView,
          state: runState,
          generationId,
          status: "interrupted",
          usage: usageAggregate,
        });
        if (error.reason === "cancelled") {
          stream.done({ cancelled: true });
        } else {
          stream.error(error.message);
        }
        return;
      }

      this.handleSendError(error, stream);
      record.status = isCancellationError(error) ? "interrupted" : "error";
      if (!isCancellationError(error)) {
        await runState.saveMessages({
          messages: [
            runState.createMessage("error", getErrorMessage(error), {
              generationId,
              generationStatus: "error",
            }),
          ],
          model: providerConfig.model,
        });
      }
    } finally {
      if (usageAggregate.count > 0) {
        webviewView.webview.postMessage({
          type: "assistantUsageUpdated",
          generationId,
          conversationId: task.conversationId,
          usage: structuredClone(usageAggregate),
        });
        for (const warning of checkUsageBudgets(config.usageBudgets, usageAggregate)) {
          logWarning(`[usage] ${warning.message}`, undefined, { generationId, conversationId: task.conversationId });
          webviewView.webview.postMessage({
            type: "usageWarning",
            generationId,
            conversationId: task.conversationId,
            warning,
          });
        }
        logInfo(`[usage] ${formatUsageSummary(usageAggregate)}`, undefined, { generationId, conversationId: task.conversationId });
        const conversationUsage = aggregateUsageAggregates(
          runState.getConversation()?.messages.flatMap((message) => message.usage ? [message.usage] : []) ?? [],
        );
        if (conversationUsage) {
          logInfo(`[usage:conversation] ${formatUsageSummary(conversationUsage)}`, undefined, { conversationId: task.conversationId });
        }
      }
      if (
        signal.aborted &&
        !runState.getConversation()?.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.generationId === generationId,
        )
      ) {
        await runState.saveMessages({
          messages: [
            runState.createMessage("assistant", "", {
              generationId,
              generationStatus: "interrupted",
              timeline: record.timeline,
              toolCalls: record.toolCalls,
            }),
          ],
          model: providerConfig.model,
        });
        this.dependencies.syncSelectedConversation(runState);
      }
      if (
        signal.aborted &&
        !record.eventLog.some((event) => event.type === "streamDone")
      ) {
        stream.done({ cancelled: true });
      }
      if (record.checkpointTimer) {
        clearTimeout(record.checkpointTimer);
      }
      await this.dependencies.checkpoint(record, true);
      if ((record.status as string) === "completed") {
        await checkpointStore.delete(record.conversationId);
      }
      runs.delete(generationId);
    }
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
    providerTranscript,
    usage,
  }: SaveAssistantResultOptions): Promise<void> {
    await state.saveMessages({
      messages: [
        state.createMessage("assistant", content, {
          timeline,
          toolCalls,
          generationId,
          generationStatus: status,
          contextContent: status === "completed" ? content : undefined,
          providerTranscript: status === "completed" ? undefined : providerTranscript,
          ...(usage !== undefined ? { usage } : {}),
        }),
      ],
      model,
    });
    const record = this.dependencies.runs.get(generationId);
    if (record) {
      record.content = content;
      record.timeline = timeline;
      record.toolCalls = toolCalls ?? [];
      record.status = status;
      record.providerTranscript = providerTranscript;
    }
    this.dependencies.syncSelectedConversation(state);
    const id = state.getActiveConversationId();
    if (id) {
      await webviewView.webview.postMessage({ type: "activeConversationChanged", id });
    }
  }

  private handleSendError(error: unknown, stream: StreamEventEmitter): void {
    if (isCancellationError(error)) {
      stream.done({ cancelled: true });
      return;
    }
    stream.error(getErrorMessage(error));
  }
}
