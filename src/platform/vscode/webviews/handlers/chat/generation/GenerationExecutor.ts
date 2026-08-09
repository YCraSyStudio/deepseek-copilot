import * as vscode from "vscode";
import { createHash, randomUUID } from "crypto";
import type {
  AppConfig,
  AssistantTimelineEvent,
  PermissionSnapshot,
  QueuedGenerationMessage,
  StoredToolCall,
} from "@/contracts";
import { mapReasoningEffort } from "@/contracts/deepseek/Chat";
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
  createGenerationEventSink,
  handleGenerationEvent,
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
  status: "completed" | "interrupted" | "error";
  providerTranscript?: ProviderTranscript;
  usage?: UsageAggregate;
}

interface GenerationExecutorDependencies {
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
  settings: SettingsRepository;
  secrets: SecretStore;
  modelProviderFactory: ModelProviderFactory;
  recoverCancelledDraft: (conversationId: string, draft: QueuedGenerationMessage) => void;
  syncCancelledConversation: (conversationId: string, conversation: ReturnType<ConversationState["getConversation"]>) => void;
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
      const restoredDraft = this.createCancelledDraft(task);
      if (getGenerationStopReason(signal) === "user_cancelled") {
        this.dependencies.recoverCancelledDraft(task.conversationId, restoredDraft);
      }
      this.dependencies.post({
        type: "streamDone",
        generationId,
        conversationId: task.conversationId,
        cancelled: true,
        ...(getGenerationStopReason(signal) === "user_cancelled" ? { restoredDraft } : {}),
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
        const cancelled = signal.aborted;
        const userCancelled = cancelled && getGenerationStopReason(signal) === "user_cancelled";
        if (userCancelled) {
          this.logCompletedToolsNotRolledBack(record);
          const remaining = await record.state.removeGeneration(generationId);
          if (!remaining) {
            await historyManager.delete(record.conversationId);
          }
          this.dependencies.syncCancelledConversation(record.conversationId, remaining);
          const restoredDraft = this.createCancelledDraft(task);
          this.dependencies.recoverCancelledDraft(record.conversationId, restoredDraft);
          if (record.status === "cancelling") {
            transitionGenerationRun(record, "cancelled");
          }
          handleGenerationEvent(
            record,
            { type: "streamDone", cancelled: true, restoredDraft },
            this.dependencies.generationEventCallbacks,
          );
          await this.dependencies.checkpointStore.delete(record.conversationId).catch(() => undefined);
          publishGenerationTerminal(record, this.dependencies.generationEventCallbacks, {
            type: "streamDone",
            cancelled: true,
            restoredDraft,
          });
          this.dependencies.runs.delete(generationId);
          return;
        }
        if (record.status !== "cancelling") {
          transitionGenerationRun(record, cancelled ? "interrupted" : "error");
        }
        handleGenerationEvent(
          record,
          cancelled
            ? { type: "streamDone", cancelled: true }
            : { type: "streamError", error: getErrorMessage(error) },
          this.dependencies.generationEventCallbacks,
        );
        await this.dependencies.checkpoint(record, true).catch(() => undefined);
        publishGenerationTerminal(
          record,
          this.dependencies.generationEventCallbacks,
          cancelled
            ? { type: "streamDone", cancelled: true }
            : { type: "streamError", error: getErrorMessage(error) },
        );
        this.dependencies.runs.delete(generationId);
      } else {
        const userCancelled = getGenerationStopReason(signal) === "user_cancelled";
        const restoredDraft = this.createCancelledDraft(task);
        if (userCancelled) {
          this.dependencies.recoverCancelledDraft(task.conversationId, restoredDraft);
        }
        this.dependencies.post({
          type: signal.aborted ? "streamDone" : "streamError",
          generationId,
          conversationId: task.conversationId,
          ...(signal.aborted
            ? { cancelled: true, ...(userCancelled ? { restoredDraft } : {}) }
            : { error: getErrorMessage(error) }),
        });
      }
    }
  }

  private createCancelledDraft(task: GenerationTask<SendMessagePayload>): QueuedGenerationMessage {
    return {
      clientRequestId: task.clientRequestId,
      text: task.payload.text,
      queuedAt: task.queuedAt,
      reason: "cancelled",
      referencedFiles: task.payload.referencedFiles,
    };
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
      dangerTrustStore,
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
    }), dangerTrustStore);
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
    const userMessage = runState.createMessage("user", payload.text, { generationId });
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
      message: { role: "user", content: userMessage.content },
    });
    stream.showTyping();

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
        eventSink,
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
              model: toolProviderConfig.model,
            });
            this.dependencies.syncSelectedConversation(runState);
          },
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
      const userCancelled = signal.aborted && getGenerationStopReason(signal) === "user_cancelled";
      if (error instanceof PartialStreamError) {
        if (!userCancelled) {
          await this.saveAssistantResult({
            content: error.partial.content,
            timeline: error.partial.timeline,
            model: providerConfig.model,
            state: runState,
            generationId,
            status: "interrupted",
            usage: usageAggregate,
          });
        }
        if (error.reason === "cancelled") {
          stream.done({ cancelled: true });
        } else {
          stream.error(error.message);
        }
        return;
      }

      const cancelled = signal.aborted || isCancellationError(error);
      this.handleSendError(error, stream, signal);
      transitionGenerationRun(record, cancelled ? "interrupted" : "error");
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
      if (
        signal.aborted && !userCancelled &&
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
              contextContent: buildInterruptedContextContent("", record.toolCalls),
            }),
          ],
          model: providerConfig.model,
        });
        this.dependencies.syncSelectedConversation(runState);
      }
      if (signal.aborted) {
        stream.done({ cancelled: true });
      }
      if (record.checkpointTimer) {
        clearTimeout(record.checkpointTimer);
      }
      if (userCancelled) {
        this.logCompletedToolsNotRolledBack(record);
        const remaining = await runState.removeGeneration(generationId);
        if (!remaining) {
          await historyManager.delete(record.conversationId);
        }
        this.dependencies.syncCancelledConversation(record.conversationId, remaining);
        const restoredDraft = this.createCancelledDraft(task);
        this.dependencies.recoverCancelledDraft(record.conversationId, restoredDraft);
        if (record.status !== "cancelling") {
          transitionGenerationRun(record, "cancelling");
        }
        transitionGenerationRun(record, "cancelled");
        await checkpointStore.delete(record.conversationId);
        publishGenerationTerminal(record, this.dependencies.generationEventCallbacks, {
          type: "streamDone",
          cancelled: true,
          restoredDraft,
        });
      } else {
        await this.dependencies.checkpoint(record, true);
        if ((record.status as string) === "completed") {
          await checkpointStore.delete(record.conversationId);
        }
        const pendingIsError = record.pendingTerminalEvent?.type === "streamError" || record.status === "error";
        publishGenerationTerminal(
          record,
          this.dependencies.generationEventCallbacks,
          pendingIsError
            ? { type: "streamError", error: String(record.pendingTerminalEvent?.error ?? "Generation failed") }
            : { type: "streamDone", ...(signal.aborted ? { cancelled: true } : {}) },
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

  private handleSendError(error: unknown, stream: StreamEventEmitter, signal?: AbortSignal): void {
    if (signal?.aborted || isCancellationError(error)) {
      stream.done({ cancelled: true });
      return;
    }
    stream.error(getErrorMessage(error));
  }
}
