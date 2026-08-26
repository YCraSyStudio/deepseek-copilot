import type { PermissionSnapshot, ToolCall } from "@/contracts";
import type { GenerationEventSink } from "@/application/ports";
import { runToolCallCycle } from "@/application/chat/toolCall";
import { shouldEnforceToolCallLimits } from "@/application/chat/toolCall/PermissionPolicy";
import { createDeepSeekToolCallModelClient } from "@/infrastructure/deepseek/providers/deepseek/features/toolCall/DeepSeekToolCallModelClient";
import { logWarning } from "@/shared/logging/Logger";
import { redactSensitiveText } from "@/shared/security/Redaction";
import type { ToolExecutor } from "@/application/tools/ToolExecutor";
import type { ConfirmationRequiredResult } from "@/application/tools/Types";
import { requestDangerConfirmation } from "./DangerConfirmation";
import { cancelPendingToolCallCycle, createPendingToolCallCycle, resolveToolCallAction } from "./PendingCycle";
import { StreamEventEmitter } from "../StreamEventEmitter";
import { executeToolCall, recordSyntheticToolError } from "./ToolExecution";
import { MutationFailureGuard } from "./MutationFailureGuard";
import type {
  HandleRunErrorOptions,
  PendingDangerConfirmation,
  PendingToolCallCycle,
  PostFinalMessageOptions,
  StoredExecution,
  ToolCallActionPayload,
  ToolCallLimitDecision,
  ToolCallRunOptions,
  ToolCallRunResult,
} from "./Types";
import { createProviderTranscript } from "@/application/chat/ProviderTranscript";
import { getToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import { reviewCommandSafety } from "@/infrastructure/deepseek/security/commandReview";
import { compactToolCycleContext } from "@/application/chat/context/ToolCycleCompaction";
import { isCancellationError } from "@/shared/utils/Cancellation";
import { getTextContent } from "@/contracts/deepseek/Chat";

export class ToolCallSession {
  private pendingToolCallCycle: PendingToolCallCycle | null = null;
  private pendingDangerConfirmation: PendingDangerConfirmation | null = null;
  private activePermissionSnapshot?: PermissionSnapshot;
  private currentRound = 0;
  private activeEventSink?: GenerationEventSink<Record<string, unknown>>;
  private pendingLimitDecision: ((decision: ToolCallLimitDecision) => void) | null = null;
  private webTainted = false;
  constructor(private readonly toolExecutor: ToolExecutor) {}

  async run(options: ToolCallRunOptions): Promise<ToolCallRunResult | undefined> {
    this.activeEventSink = options.eventSink;
    this.activePermissionSnapshot = options.permissionSnapshot;
    this.webTainted = false;
    let streamedContent = "";
    const executedToolCalls = new Map<string, StoredExecution>();
    const mutationFailureGuard = new MutationFailureGuard();
    const stream = new StreamEventEmitter(options.eventSink);

    try {
      const result = await runToolCallCycle({
        initialMessages: options.messages,
        tools: options.tools,
        model: options.providerConfig.model,
        modelClient: createDeepSeekToolCallModelClient(
          options.providerConfig.apiKey,
          options.providerConfig.baseUrl,
        ),
        executeToolCall: async (toolCall) => {
          const context = this.createExecutionContext(options, executedToolCalls);
          const blocked = mutationFailureGuard.getBlockReason(toolCall);
          if (blocked) {
            recordSyntheticToolError(toolCall, context, blocked);
            return blocked;
          }
          const result = await executeToolCall(toolCall, context);
          mutationFailureGuard.record(toolCall, executedToolCalls.get(toolCall.id));
          return result;
        },
        cycleOptions: {
          getToolsForRound: async () => {
            const snapshot = await options.capturePermissionSnapshot();
            this.activePermissionSnapshot = snapshot;
            options.onPermissionSnapshot?.(snapshot);
            return options.tools;
          },
          maxRounds: options.providerConfig.maxToolRounds,
          maxToolCallsPerBatch: options.providerConfig.maxToolRounds * 4,
          shouldEnforceToolCallLimits: () => shouldEnforceToolCallLimits(
            this.activePermissionSnapshot ?? options.permissionSnapshot,
          ),
          signal: options.signal,
          streamFinalResponse: true,
          streamToolCallRounds: hasAutomaticPermissionMode(options),
          thinkingMode: options.providerConfig.thinkingMode,
          reasoningEffort: options.providerConfig.reasoningEffort as "high" | "max" | undefined,
          maxTokens: options.providerConfig.maxTokens,
          userId: options.providerConfig.userId,
          budgetManager: options.budgetManager,
          onRecoveryStarted: () => options.eventSink.publish({
            type: "generationRecoveryStarted",
            reason: "excessive_reasoning",
            message: "The previous tool round reasoned more than necessary. Retrying once concisely.",
          }),
          onRoundStart: async (round, toolCalls) => {
            stream.toolGroup(round, toolCalls.map((toolCall) => toolCall.id));
            await this.handleRoundStart(round, toolCalls, options);
          },
          onStreamChunk: (content) => {
            streamedContent += content;
            stream.chunk(content);
          },
          onStreamReasoning: (reasoning) => {
            if (options.exposeReasoning) {
              stream.reasoning(reasoning);
            }
          },
          onUsage: (usage) => options.onUsage?.("tool_round", usage),
          onTranscriptUpdate: (messages, status) => {
            options.onTranscriptUpdate?.(createProviderTranscript(messages, status));
          },
          prepareRequestContext: async (messages, toolsForRound, round) => {
            const assessment = options.budgetManager.assessRequest(messages, toolsForRound);
            if (assessment.status === "within_budget") {return undefined;}
            if (!options.budgetManager.canCompactAutomatically()) {
              await options.eventSink.publish({
                type: "resourceLimitReached",
                resource: "automatic_compactions",
                error: "This generation exhausted its automatic context-compaction budget. Continue in a new turn.",
              });
              throw new Error("Automatic context-compaction limit reached. Continue in a new turn.");
            }

            const compacted = compactToolCycleContext(
              options.budgetManager,
              messages,
              toolsForRound,
              options.trustedUserRequest,
              executedToolCalls.values(),
              round,
            );
            if (!compacted) {return undefined;}
            options.budgetManager.recordAutomaticCompaction();
            await options.onContextCompacted?.({
              estimatedTokensBefore: compacted.estimatedTokensBefore,
              estimatedTokensAfter: compacted.estimatedTokensAfter,
            });
            await options.eventSink.publish({ type: "contextCompacted" });
            return compacted.messages;
          },
          onToolSkipped: (toolCall, result) => {
            recordSyntheticToolError(toolCall, this.createExecutionContext(options, executedToolCalls), result);
          },
          validateRequestBudget: (messages, toolsForRound) => {
            const assessment = options.budgetManager.assessRequest(messages, toolsForRound);
            if (assessment.status === "hard_limit") {
              options.budgetManager.assertRequestFitsContext(messages, toolsForRound);
            }
          },
          onLimitReached: (completedRounds, batchSize, completedToolCalls, toolCallBudget) =>
            this.requestLimitDecision(options.eventSink, completedRounds, batchSize, completedToolCalls, toolCallBudget),
        },
      });

      return this.postFinalMessage({ options, stream, result, executedToolCalls, streamedContent });
    } catch (err: unknown) {
      return this.handleRunError({ err, options, stream, executedToolCalls, streamedContent });
    } finally {
      this.pendingToolCallCycle = null;
      this.pendingDangerConfirmation = null;
      this.pendingLimitDecision = null;
      this.activeEventSink = undefined;
      this.activePermissionSnapshot = undefined;
      this.webTainted = false;
    }
  }

  cancel(): void {
    this.pendingLimitDecision?.("stop");
    this.pendingLimitDecision = null;
    if (this.pendingToolCallCycle) {
      for (const [toolCallId, toolCall] of this.pendingToolCallCycle.toolCalls) {
        if (!this.pendingToolCallCycle.resolved.has(toolCallId)) {
          void this.activeEventSink?.publish({
            type: "toolCallResult",
            toolCallId,
            toolName: toolCall.function.name,
            result: "Cancelled with the active generation.",
            isError: false,
            status: "cancelled",
          });
        }
      }
      cancelPendingToolCallCycle(this.pendingToolCallCycle);
    }
    if (this.pendingDangerConfirmation) {
      void this.activeEventSink?.publish({
        type: "toolCallResult",
        toolCallId: this.pendingDangerConfirmation.toolCall.id,
        toolName: this.pendingDangerConfirmation.toolCall.function.name,
        result: "Cancelled with the active generation.",
        isError: false,
        status: "cancelled",
      });
      this.pendingDangerConfirmation.resolve({ confirmed: false });
    }
    this.pendingToolCallCycle = null;
    this.pendingDangerConfirmation = null;
  }

  handleUserAction(payload: ToolCallActionPayload): void {
    if (this.pendingDangerConfirmation?.toolCall.id === payload.toolCallId) {
      this.pendingDangerConfirmation.resolve({
        confirmed: payload.action === "execute",
      });
      void this.activeEventSink?.publish({
        type: "toolCallActionAccepted",
        toolCallId: payload.toolCallId,
        status: payload.action === "execute" ? "running" : "rejected",
      });
      return;
    }

    if (!this.pendingToolCallCycle) {
      logWarning("[ChatHandler] No pending tool call cycle for manual execution");
      return;
    }

    const actionResult = resolveToolCallAction(this.pendingToolCallCycle, payload.toolCallId, payload.action);
    if (actionResult === "missing") {
      logWarning(`[ChatHandler] Tool call ${payload.toolCallId} not found in pending cycle`);
    } else if (actionResult === "duplicate") {
      logWarning(`[ChatHandler] Tool call ${payload.toolCallId} already resolved`);
    } else {
      void this.activeEventSink?.publish({
        type: "toolCallActionAccepted",
        toolCallId: payload.toolCallId,
        status: payload.action === "execute" ? "running" : "rejected",
      });
    }
  }

  handleLimitDecision(decision: ToolCallLimitDecision): void {
    if (!this.pendingLimitDecision) {
      logWarning("[ChatHandler] No pending tool call limit decision");
      return;
    }
    const resolve = this.pendingLimitDecision;
    this.pendingLimitDecision = null;
    resolve(decision);
  }

  private requestLimitDecision(
    eventSink: GenerationEventSink<Record<string, unknown>>,
    completedRounds: number,
    batchSize: number,
    completedToolCalls: number,
    toolCallBudget: number,
  ): Promise<ToolCallLimitDecision> {
    if (this.pendingLimitDecision) {
      return Promise.resolve("stop");
    }
    eventSink.publish({ type: "toolCallLimitReached", completedRounds, batchSize, completedToolCalls, toolCallBudget });
    return new Promise((resolve) => {
      this.pendingLimitDecision = resolve;
    });
  }

  private createExecutionContext(options: ToolCallRunOptions, executedToolCalls: Map<string, StoredExecution>) {
    return {
      toolExecutor: this.toolExecutor,
      eventSink: options.eventSink,
      executedToolCalls,
      signal: options.signal,
      autoApproveMode: this.activePermissionSnapshot?.permissionMode === "auto-approve",
      fullAccessMode: this.activePermissionSnapshot?.permissionMode === "full-access",
      generationId: options.generationId,
      trustedUserRequest: options.trustedUserRequest,
      availableToolNames: options.tools.map((tool) => tool.function.name),
      authorizedUserUrls: options.authorizedUserUrls,
      isWebTainted: () => this.webTainted,
      markWebTainted: () => {this.webTainted = true;},
      analyzeImages: options.analyzeImages,
      isWorkspaceTrusted: options.isWorkspaceTrusted,
      getCurrentRound: () => this.currentRound,
      getPendingCycle: () => this.pendingToolCallCycle,
      requestDangerConfirmation: (
        toolCall: ToolCall,
        confirmationResult: ConfirmationRequiredResult,
        dangerOptions?: { announceStarted?: boolean; round?: number },
      ) =>
        requestDangerConfirmation({
          eventSink: options.eventSink,
          toolCall,
          confirmationResult,
          setPendingDangerConfirmation: (value) => {
            this.pendingDangerConfirmation = value;
          },
          ...dangerOptions,
        }),
      reviewDangerousCommand: (toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult) =>
        reviewCommandSafety({
          toolCall,
          actionContext: confirmationResult,
          providerConfig: options.providerConfig,
          originalUserRequest: options.trustedUserRequest,
          onUsage: (usage) => options.onUsage?.("security_review", usage),
          workspaceRoot: confirmationResult.workspaceRoot ?? getToolWorkspaceHost().getRootPath?.(),
          signal: options.signal,
        }),
    };
  }

  private async handleRoundStart(round: number, toolCalls: ToolCall[], options: ToolCallRunOptions): Promise<void> {
    this.currentRound = round;
    options.eventSink.publish({ type: "toolCallStarted", toolCalls, round });

    const snapshot = this.activePermissionSnapshot ?? options.permissionSnapshot;
    const manualToolCalls = snapshot.permissionMode === "auto-approve" || snapshot.permissionMode === "full-access"
      ? []
      : toolCalls;
    if (manualToolCalls.length === 0) {
      return;
    }

    const pendingCycle = createPendingToolCallCycle(manualToolCalls, round);
    this.pendingToolCallCycle = pendingCycle;
    options.eventSink.publish({
      type: "toolCallConfirmationRequired",
      toolCalls: manualToolCalls,
      round,
      autoExecute: false,
    });

  }

  private postFinalMessage({ options, stream, result, executedToolCalls, streamedContent }: PostFinalMessageOptions): ToolCallRunResult {
    const toolCallResults = Array.from(executedToolCalls.values());
    const timeline = stream.getTimeline();
    const hasStreamedContent = timeline.length > 0;

    if (getTextContent(result.finalMessage.content) || toolCallResults.length > 0) {
      options.eventSink.publish({
        type: "addMessage",
        message: {
          role: "assistant",
          content: hasStreamedContent ? "" : getTextContent(result.finalMessage.content),
          wasStreamed: hasStreamedContent,
          toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
          timeline,
        },
      });
    }

    const finishReason = result.response.choices[0]?.finish_reason;
    const complete = finishReason === "stop";
    stream.done({ finish_reason: finishReason ?? undefined });

    return {
      content: hasStreamedContent ? streamedContent : getTextContent(result.finalMessage.content),
      timeline,
      toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
      partial: !complete,
      providerTranscript: createProviderTranscript(result.transcript, complete ? "complete" : "incomplete", finishReason),
    };
  }

  private handleRunError({ err, options, stream, executedToolCalls, streamedContent }: HandleRunErrorOptions): ToolCallRunResult | undefined {
    if (isCancellationError(err, options.signal)) {
      for (const execution of executedToolCalls.values()) {
        if (execution.status === "pending" || execution.status === "awaiting_confirmation" || execution.status === "running") {
          execution.status = "cancelled";
          execution.isError = false;
          execution.requiresConfirmation = false;
          execution.result ??= "Cancelled with the active generation.";
          void options.eventSink.publish({
            type: "toolCallResult",
            toolCallId: execution.toolCallId,
            toolName: execution.toolName,
            result: execution.result,
            isError: false,
            status: "cancelled",
          });
        }
      }
      const partialToolCalls = Array.from(executedToolCalls.values());
      const timeline = stream.getTimeline();
      const hasPartial = timeline.length > 0 || partialToolCalls.length > 0;

      if (!options.isCancelling()) {
        if (partialToolCalls.length > 0) {
          options.eventSink.publish({
            type: "addMessage",
            message: {
              role: "assistant",
              content: streamedContent || "",
              wasStreamed: timeline.length > 0,
              toolCalls: partialToolCalls,
              timeline,
            },
          });
        }
        stream.done({ status: "interrupted" });
      }

      return hasPartial
        ? {
            content: streamedContent,
            timeline,
            toolCalls: partialToolCalls.length > 0 ? partialToolCalls : undefined,
            partial: true,
          }
        : undefined;
    }

    for (const execution of executedToolCalls.values()) {
      if (execution.status === "pending" || execution.status === "awaiting_confirmation" || execution.status === "running") {
        execution.status = "error";
        execution.isError = true;
        execution.requiresConfirmation = false;
        execution.result ??= "Tool execution ended because the generation failed.";
        void options.eventSink.publish({
          type: "toolCallResult",
          toolCallId: execution.toolCallId,
          toolName: execution.toolName,
          result: execution.result,
          isError: true,
          status: "error",
        });
      }
    }
    const partialToolCalls = Array.from(executedToolCalls.values());
    const timeline = stream.getTimeline();
    if (partialToolCalls.length > 0) {
      options.eventSink.publish({
        type: "addMessage",
        message: {
          role: "assistant",
          content: streamedContent,
          wasStreamed: timeline.length > 0,
          toolCalls: partialToolCalls,
          timeline,
        },
      });
    }
    stream.error(`Error en tool calls: ${getErrorMessage(err)}`);
    return partialToolCalls.length > 0 || timeline.length > 0
      ? {
          content: streamedContent,
          timeline,
          toolCalls: partialToolCalls.length > 0 ? partialToolCalls : undefined,
          partial: true,
        }
      : undefined;
  }
}

function getErrorMessage(err: unknown): string {
  return redactSensitiveText(err);
}

function hasAutomaticPermissionMode(options: ToolCallRunOptions): boolean {
  return options.permissionSnapshot.permissionMode === "auto-approve" ||
    options.permissionSnapshot.permissionMode === "full-access";
}
