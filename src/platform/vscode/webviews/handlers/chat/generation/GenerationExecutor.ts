import * as vscode from "vscode";
import { createHash, randomUUID } from "crypto";
import type {
  AppConfig,
  AssistantTimelineEvent,
  PermissionSnapshot,
  StoredToolCall,
} from "@/contracts";
import { DEEPSEEK_PRO_MODEL_ID, DEEPSEEK_VISION_MODEL_ID } from "@/contracts";
import { getTextContent, mapReasoningEffort } from "@/contracts/deepseek/Chat";
import { ConversationState } from "@/application/chat/ConversationState";
import { buildInterruptedContextContent } from "@/application/chat/InterruptedContext";
import { getGenerationStopReason, type GenerationTask } from "@/application/chat/GenerationCoordinator";
import {
  createProviderTranscript,
  type ProviderTranscript,
} from "@/application/chat/ProviderTranscript";
import { PartialStreamError } from "@/application/errors/PartialStreamError";
import { GenerationBudgetManager } from "@/application/chat/context/GenerationBudgetManager";
import { ToolExecutor, type ToolRegistry } from "@/application/tools";
import type { ModelProviderFactory, SecretStore, SettingsRepository } from "@/application/ports";
import { getToolWorkspaceHost, runWithToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import {
  aggregateUsageAggregates,
  createUsageAggregate,
  formatUsageSummary,
  isOfficialDeepSeekEndpoint,
  recordUsage,
  type ProviderUsage,
  type UsageAggregate,
} from "@/shared/usage/Usage";
import { logInfo } from "@/shared/logging/Logger";
import type {
  GenerationCheckpointStore,
  HistoryManager,
} from "@/platform/vscode/storage";
import { createVsCodeToolWorkspace } from "@/platform/vscode/tools/VsCodeToolWorkspace";
import { extractHttpsUrls } from "@/infrastructure/browser/NetworkPolicy";
import {
  captureWorkspaceRunSnapshot,
  createLegacyWorkspaceBinding,
  type WorkspaceRunSnapshot,
} from "@/platform/vscode/workspace";
import { StreamEventEmitter } from "../StreamEventEmitter";
import { sendMessageStreaming } from "../Streaming";
import type { SendMessagePayload } from "../Types";
import { ToolCallSession } from "../toolCalls/ToolCallSession";
import {
  appendToolAvailabilityContext,
  getErrorMessage,
  isCancellationError,
} from "../ChatHandlerSupport";
import {
  buildGenerationMessages,
  fitGenerationRequestContext,
} from "./GenerationContext";
import {
  createGenerationEventSink,
  publishGenerationTerminal,
  transitionGenerationRun,
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
  status: "completed" | "cancelled" | "interrupted" | "error";
  stopReason?: "user_cancelled" | "steered" | "workspace_changed" | "shutdown" | "deleted" | "history_transition";
  providerTranscript?: ProviderTranscript;
  usage?: UsageAggregate;
}

interface GenerationExecutorDependencies {
  historyManager: HistoryManager;
  activeConversationState: ConversationState;
  toolRegistry: ToolRegistry;
  checkpointStore: GenerationCheckpointStore;
  runs: Map<string, GenerationRunRecord>;
  generationEventCallbacks: GenerationEventCallbacks;
  checkpoint: (record: GenerationRunRecord, immediate: boolean) => Promise<void>;
  scheduleCheckpoint: (record: GenerationRunRecord) => void;
  syncSelectedConversation: (state: ConversationState) => void;
  post: (message: Record<string, unknown>) => void;
  settings: SettingsRepository;
  secrets: SecretStore;
  modelProviderFactory: ModelProviderFactory;
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
      const generationStopReason = getGenerationStopReason(signal);
      const status = generationStopReason === "user_cancelled" ? "cancelled" : "interrupted";
      this.dependencies.post({
        type: "streamDone",
        generationId,
        conversationId: task.conversationId,
        status,
        generationStopReason,
      });
      return;
    }

    try {
      const binding = conversation?.workspaceBinding ??
        createLegacyWorkspaceBinding(conversation?.workspaceUri ?? "workspace:unknown");
      const workspaceSnapshot = captureWorkspaceRunSnapshot(binding);
      const permissionSnapshot = await this.dependencies.settings.capturePermissionSnapshot(
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
        const aborted = signal.aborted || isCancellationError(error);
        const status = getGenerationStopReason(signal) === "user_cancelled" ? "cancelled" : "interrupted";
        if (aborted) {
          if (status === "cancelled") {this.logCompletedToolsNotRolledBack(record);}
          await this.persistTerminalAssistant(record, task.payload.modelId, status, getGenerationStopReason(signal));
          this.transitionToTerminal(record, status);
        } else {
          transitionGenerationRun(record, "error");
        }
        await this.dependencies.checkpointStore.delete(record.conversationId).catch(() => undefined);
        publishGenerationTerminal(
          record,
          this.dependencies.generationEventCallbacks,
          aborted
            ? { type: "streamDone", status, generationStopReason: getGenerationStopReason(signal) }
            : { type: "streamError", error: getErrorMessage(error) },
        );
        this.dependencies.runs.delete(generationId);
      } else {
        this.dependencies.post({
          type: signal.aborted ? "streamDone" : "streamError",
          generationId,
          conversationId: task.conversationId,
          ...(signal.aborted
            ? {
                status: getGenerationStopReason(signal) === "user_cancelled" ? "cancelled" : "interrupted",
                generationStopReason: getGenerationStopReason(signal),
              }
            : { error: getErrorMessage(error) }),
        });
      }
    }
  }

  private logCompletedToolsNotRolledBack(record: GenerationRunRecord): void {
    if (record.cancellationEffectsLogged) {
      return;
    }
    record.cancellationEffectsLogged = true;
    const completedToolCount = record.toolCalls
      .filter((toolCall) => toolCall.status === "completed").length;
    if (completedToolCount > 0) {
      logInfo(`[cancel] ${completedToolCount} completed tool effect(s) were not rolled back.`, undefined, {
        generationId: record.generationId,
        conversationId: record.conversationId,
      });
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
      historyManager,
      runs,
      toolRegistry,
    } = this.dependencies;
    const payload = task.payload;
    const config = this.dependencies.settings.load();
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

    const session = new ToolCallSession(new ToolExecutor(toolRegistry, () => {
      const host = getToolWorkspaceHost();
      return host.getWorkspaceId?.() ?? host.getRootPath() ?? "workspace:unknown";
    }));
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
      budgetManager: new GenerationBudgetManager(payload.modelId || config.model, config.maxTokens),
    };
    runs.set(generationId, record);
    const eventSink = createGenerationEventSink(
      record,
      this.dependencies.generationEventCallbacks,
    );
    const requestedThinkingMode = payload.reasoning !== "off";
    const requestedModel = payload.modelId || config.model;
    const apiKey = await this.dependencies.secrets.getApiKey(config.baseUrl);

    if (!apiKey) {
      throw new Error("API key is not configured. Open Settings -> API Key.");
    }

    const providerConfig: AppConfig = {
      ...config,
      apiKey,
      model: requestedModel,
      maxTokens: record.budgetManager.effectiveMaxTokens,
      thinkingMode: requestedThinkingMode,
      reasoningEffort: mapReasoningEffort(payload.reasoning),
    };
    const provider = this.dependencies.modelProviderFactory.create(providerConfig);
    const usageAggregate = createUsageAggregate(isOfficialDeepSeekEndpoint(providerConfig.baseUrl), providerConfig.model);
    const recordPrimaryUsage = (usage: ProviderUsage | undefined): void => {
      recordUsage(usageAggregate, "primary", usage);
    };
    const stream = new StreamEventEmitter(eventSink);
    const userMessage = runState.createMessage("user", payload.text, {
      generationId,
      imageAttachments: payload.imageAttachments,
    });
    record.userMessage = userMessage;
    let messages = await buildGenerationMessages({
      payload,
      config,
      eventSink,
      state: runState,
      workspaceSnapshot,
      excludedGenerationId: generationId,
      signal,
    });
    await runState.saveMessages({ messages: [userMessage], model: providerConfig.model });
    this.dependencies.syncSelectedConversation(runState);
    await this.dependencies.checkpoint(record, true);

    await eventSink.publish({
      type: "addMessage",
      message: { role: "user", content: userMessage.content, imageAttachments: userMessage.imageAttachments },
    });
    stream.showTyping();

    try {
      const allTools = toolRegistry.getDefinitionsForAPI();
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
      const tools = workspaceTools.filter((tool) => {
        if (!providerConfig.webSearchEnabled && (tool.function.name === "search_web" || tool.function.name === "read_web")) {
          return false;
        }
        if (tool.function.name === "analyze_images") {
          return requestedModel === DEEPSEEK_PRO_MODEL_ID && (payload.imageAttachments?.length ?? 0) > 0;
        }
        return true;
      });
      appendToolAvailabilityContext(
        messages,
        initialPermissionSnapshot.permissionMode,
        tools,
        workspaceSnapshot,
      );
      messages = await fitGenerationRequestContext({
        messages,
        payload,
        config: providerConfig,
        provider,
        state: runState,
        eventSink,
        workspaceSnapshot,
        generationId,
        record,
        tools,
        permissionMode: initialPermissionSnapshot.permissionMode,
        enabledTools: tools,
        signal,
        checkpoint: (run) => this.dependencies.checkpoint(run, true),
        onUsage: (phase, usage) => recordUsage(usageAggregate, phase, usage),
      });

      if (tools.length > 0) {
        const result = await session.run({
          messages,
          tools,
          providerConfig,
          eventSink,
          permissionSnapshot: initialPermissionSnapshot,
          capturePermissionSnapshot: () =>
            this.dependencies.settings.capturePermissionSnapshot(vscode.workspace.isTrusted),
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
          budgetManager: record.budgetManager,
          analyzeImages: this.createImageAnalyzer(payload, providerConfig, usageAggregate),
          onContextCompacted: async ({ estimatedTokensBefore, estimatedTokensAfter }) => {
            const previous = runState.getConversation()?.contextSummary;
            const now = Date.now();
            const sourceDigest = createHash("sha256")
              .update(`${generationId}:${estimatedTokensBefore}:${estimatedTokensAfter}`)
              .digest("hex");
            await runState.saveContextSummary({
              schemaVersion: 2,
              provider: previous?.provider ?? "local",
              content: previous?.content ?? "",
              coveredGenerationIds: previous?.coveredGenerationIds ?? [],
              sourceDigest: previous?.sourceDigest ?? sourceDigest,
              updatedAt: now,
              boundaries: [
                ...(previous?.boundaries ?? []),
                {
                  id: randomUUID(),
                  createdAt: now,
                  reason: "tool_cycle_rollover" as const,
                  estimatedTokensBefore,
                  estimatedTokensAfter,
                  coveredGenerationIds: [],
                  sourceDigest,
                },
              ].slice(-1_000),
            });
            await runState.saveMessages({
              messages: [runState.createMessage("context", "Context automatically compacted", { generationId })],
              model: providerConfig.model,
            });
            this.dependencies.syncSelectedConversation(runState);
          },
        });
        if (result) {
          await this.saveAssistantResult({
            content: result.content,
            timeline: result.timeline,
            model: providerConfig.model,
            toolCalls: result.toolCalls as StoredToolCall[] | undefined,
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
          config: providerConfig,
          provider,
          eventSink,
          signal,
          budgetManager: record.budgetManager,
        });
        await this.saveAssistantResult({
          content: result.content,
          timeline: result.timeline,
          model: providerConfig.model,
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
        const stopReason = getGenerationStopReason(signal);
        const status = stopReason === "user_cancelled" ? "cancelled" : "interrupted";
        await this.saveAssistantResult({
          content: error.partial.content,
          timeline: error.partial.timeline,
          model: providerConfig.model,
          state: runState,
          generationId,
          status,
          stopReason,
          usage: usageAggregate,
        });
        if (error.reason === "cancelled") {
          stream.done({ status, generationStopReason: stopReason });
        } else {
          stream.error(error.message);
        }
        return;
      }

      const cancelled = signal.aborted || isCancellationError(error);
      this.handleSendError(error, stream, signal);
      if (!cancelled) {transitionGenerationRun(record, "error");}
      if (!cancelled) {
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
        eventSink.publish({
          type: "assistantUsageUpdated",
          generationId,
          conversationId: task.conversationId,
          usage: structuredClone(usageAggregate),
        });
        logInfo(`[usage] ${formatUsageSummary(usageAggregate)}`, undefined, { generationId, conversationId: task.conversationId });
        const conversationUsage = aggregateUsageAggregates(
          runState.getConversation()?.messages.flatMap((message) => message.usage ? [message.usage] : []) ?? [],
        );
        if (conversationUsage) {
          logInfo(`[usage:conversation] ${formatUsageSummary(conversationUsage)}`, undefined, { conversationId: task.conversationId });
        }
      }
      const stopReason = getGenerationStopReason(signal);
      const userCancelled = signal.aborted && stopReason === "user_cancelled";
      const interrupted = signal.aborted && !userCancelled;
      const terminalStatus = userCancelled ? "cancelled" : interrupted ? "interrupted" : undefined;
      if (
        terminalStatus &&
        !runState.getConversation()?.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.generationId === generationId,
        )
      ) {
        await this.saveAssistantResult({
          content: record.content,
          timeline: record.timeline,
          toolCalls: record.toolCalls,
          generationId,
          status: terminalStatus,
          stopReason,
          model: providerConfig.model,
          state: runState,
          providerTranscript: record.providerTranscript,
          usage: usageAggregate.count > 0 ? usageAggregate : undefined,
        });
      }
      if (terminalStatus) {
        stream.done({ status: terminalStatus, generationStopReason: stopReason });
      }
      if (record.checkpointTimer) {
        clearTimeout(record.checkpointTimer);
      }
      if (userCancelled) {
        this.logCompletedToolsNotRolledBack(record);
        this.transitionToTerminal(record, "cancelled");
        await checkpointStore.delete(record.conversationId);
        publishGenerationTerminal(record, this.dependencies.generationEventCallbacks, {
          type: "streamDone",
          status: "cancelled",
          generationStopReason: stopReason,
        });
      } else {
        if (interrupted) {
          this.transitionToTerminal(record, "interrupted");
        }
        if ((record.status as string) === "completed" || interrupted) {
          await checkpointStore.delete(record.conversationId);
        } else {
          await this.dependencies.checkpoint(record, true);
        }
        const pendingIsError = record.pendingTerminalEvent?.type === "streamError" || record.status === "error";
        publishGenerationTerminal(
          record,
          this.dependencies.generationEventCallbacks,
          pendingIsError
            ? { type: "streamError", error: String(record.pendingTerminalEvent?.error ?? "Generation failed") }
            : {
                type: "streamDone",
                status: interrupted ? "interrupted" : "completed",
                ...(interrupted ? { generationStopReason: stopReason } : {}),
              },
        );
      }
      runs.delete(generationId);
    }
  }

  private async saveAssistantResult({
    content,
    timeline,
    model,
    toolCalls,
    state,
    generationId,
    status,
    stopReason,
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
          generationStopReason: stopReason,
          contextContent: status === "completed" ? content : buildInterruptedContextContent(content, toolCalls),
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
      transitionGenerationRun(record, status);
      record.providerTranscript = providerTranscript;
    }
    this.dependencies.syncSelectedConversation(state);
  }

  private async persistTerminalAssistant(
    record: GenerationRunRecord,
    model: string,
    status: "cancelled" | "interrupted",
    stopReason: ReturnType<typeof getGenerationStopReason>,
  ): Promise<void> {
    const existing = record.state.getConversation()?.messages.some(
      (message) => message.role === "assistant" && message.generationId === record.generationId,
    );
    if (existing) {return;}
    await this.saveAssistantResult({
      content: record.content,
      timeline: record.timeline,
      toolCalls: record.toolCalls,
      model,
      state: record.state,
      generationId: record.generationId,
      status,
      stopReason,
      providerTranscript: record.providerTranscript,
    });
  }

  private transitionToTerminal(record: GenerationRunRecord, status: "cancelled" | "interrupted"): void {
    if (status === "cancelled" && record.status !== "cancelling" && record.status !== "cancelled") {
      transitionGenerationRun(record, "cancelling");
    }
    transitionGenerationRun(record, status);
  }

  private createImageAnalyzer(
    payload: SendMessagePayload,
    providerConfig: AppConfig,
    usageAggregate: UsageAggregate,
  ): ((question: string, imageIds: string[], signal?: AbortSignal) => Promise<string>) | undefined {
    const attachments = payload.imageAttachments ?? [];
    if (providerConfig.model !== DEEPSEEK_PRO_MODEL_ID || attachments.length === 0) {return undefined;}

    return async (question, imageIds, signal) => {
      const selectedIds = new Set(imageIds);
      const selected = selectedIds.size > 0
        ? attachments.filter((attachment) => selectedIds.has(attachment.id))
        : attachments;
      if (selected.length === 0) {throw new Error("None of the requested image IDs belongs to the current user message.");}
      if (selected.some((attachment) => attachment.expiresAt <= Date.now())) {
        throw new Error("One or more attached DeepSeek files have expired. Attach the images again.");
      }
      if (selected.some((attachment) => normalizeBaseUrl(attachment.apiBaseUrl) !== normalizeBaseUrl(providerConfig.baseUrl))) {
        throw new Error("The attached image was uploaded to a different DeepSeek API endpoint. Attach it again.");
      }

      const visionConfig: AppConfig = {
        ...providerConfig,
        model: DEEPSEEK_VISION_MODEL_ID,
        thinkingMode: false,
        reasoningEffort: undefined,
        maxTokens: Math.min(providerConfig.maxTokens, 8_192),
      };
      const response = await this.dependencies.modelProviderFactory.create(visionConfig).chatCompletion({
        model: visionConfig.model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: question },
            ...selected.map((attachment) => ({ type: "file" as const, file_id: attachment.fileId })),
          ],
        }],
        stream: false,
        max_tokens: visionConfig.maxTokens,
        thinking: { type: "disabled" },
      }, signal);
      delete usageAggregate.model;
      delete usageAggregate.priceCatalogVersion;
      delete usageAggregate.currency;
      delete usageAggregate.costUsd;
      recordUsage(usageAggregate, "vision_analysis", response.usage);
      const content = getTextContent(response.choices[0]?.message.content).trim();
      if (!content) {throw new Error("DeepSeek V4 Vision returned an empty image analysis.");}
      return content;
    };
  }

  private handleSendError(error: unknown, stream: StreamEventEmitter, signal?: AbortSignal): void {
    if (signal?.aborted || isCancellationError(error)) {
      const generationStopReason = signal ? getGenerationStopReason(signal) : undefined;
      stream.done({
        status: generationStopReason === "user_cancelled" ? "cancelled" : "interrupted",
        generationStopReason,
      });
      return;
    }
    stream.error(getErrorMessage(error));
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "").toLowerCase();
}
