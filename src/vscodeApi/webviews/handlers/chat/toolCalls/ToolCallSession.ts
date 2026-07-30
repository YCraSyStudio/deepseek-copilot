import type * as vscode from "vscode";
import type { PermissionSnapshot, ToolCall, ToolDefinition } from "@/adapters";
import { runToolCallCycle } from "@/deepseekApi/providers/deepseek/features/toolCall";
import { logWarning } from "@/shared/logging/Logger";
import { redactSensitiveText } from "@/shared/security/Redaction";
import type { ToolExecutor } from "@/core/tools/ToolExecutor";
import type { ConfirmationRequiredResult } from "@/core/tools/Types";
import { requestDangerConfirmation } from "./DangerConfirmation";
import { cancelPendingToolCallCycle, createPendingToolCallCycle, resolveToolCallAction } from "./PendingCycle";
import { StreamEventEmitter } from "../StreamEventEmitter";
import { executeToolCall } from "./ToolExecution";
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
import { DangerTrustStore, type DangerTrustScope } from "./DangerTrustStore";
import { getRunnableToolsForPermissionSnapshot, getToolModeForPermissionSnapshot } from "./PermissionPolicy";
import { createProviderTranscript } from "@/core/chat/ProviderTranscript";
import { assertRequestFitsContext } from "@/core/context/ContextBudget";
import { getToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { reviewCommandSafety } from "@/deepseekApi/security/commandReview";

export class ToolCallSession {
  private pendingToolCallCycle: PendingToolCallCycle | null = null;
  private pendingDangerConfirmation: PendingDangerConfirmation | null = null;
  private activeTrustScope?: DangerTrustScope;
  private activePermissionSnapshot?: PermissionSnapshot;
  private currentRound = 0;
  private activeWebview?: vscode.WebviewView;
  private pendingLimitDecision: ((decision: ToolCallLimitDecision) => void) | null = null;
  constructor(
    private readonly toolExecutor: ToolExecutor,
    private readonly dangerTrustStore: DangerTrustStore = new DangerTrustStore(),
  ) {}

  async run(options: ToolCallRunOptions): Promise<ToolCallRunResult | undefined> {
    this.activeWebview = options.webviewView;
    this.activeTrustScope = options.trustScope;
    this.activePermissionSnapshot = options.permissionSnapshot;
    let streamedContent = "";
    const executedToolCalls = new Map<string, StoredExecution>();
    const enabledTools = getRunnableToolsForPermissionSnapshot(options.tools, options.permissionSnapshot).map((tool) =>
      options.providerConfig.enableBetaFeatures ? { ...tool, function: { ...tool.function, strict: true } } : tool,
    );
    const stream = new StreamEventEmitter(options.webviewView);

    try {
      const result = await runToolCallCycle({
        initialMessages: options.messages,
        tools: enabledTools,
        model: options.providerConfig.model,
        apiKey: options.providerConfig.apiKey,
        baseUrl: options.providerConfig.baseUrl,
        executeToolCall: (toolCall) => executeToolCall(toolCall, this.createExecutionContext(options, executedToolCalls)),
        cycleOptions: {
          getToolsForRound: async () => {
            const snapshot = await options.capturePermissionSnapshot();
            this.activePermissionSnapshot = snapshot;
            this.activeTrustScope = { ...options.trustScope, configFingerprint: snapshot.fingerprint };
            options.onPermissionSnapshot?.(snapshot);
            return getRunnableToolsForPermissionSnapshot(options.tools, snapshot).map((tool) =>
              options.providerConfig.enableBetaFeatures ? { ...tool, function: { ...tool.function, strict: true } } : tool,
            );
          },
          maxRounds: options.providerConfig.maxToolRounds,
          signal: options.signal,
          streamFinalResponse: true,
          streamToolCallRounds: hasAutoApprovedTools(options, enabledTools),
          thinkingMode: options.providerConfig.thinkingMode,
          reasoningEffort: options.providerConfig.reasoningEffort as "high" | "max" | undefined,
          maxTokens: options.providerConfig.maxTokens,
          userId: options.providerConfig.userId,
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
          onTranscriptUpdate: (messages, status) => {
            options.onTranscriptUpdate?.(createProviderTranscript(messages, status));
          },
          validateRequestBudget: (messages, toolsForRound) => {
            assertRequestFitsContext(
              messages,
              toolsForRound,
              options.providerConfig.model,
              options.providerConfig.maxTokens,
            );
          },
          onLimitReached: (completedRounds, batchSize) =>
            this.shouldDelegateLimitDecision()
              ? "delegate"
              : this.requestLimitDecision(options.webviewView, completedRounds, batchSize),
        },
      });

      return this.postFinalMessage({ options, stream, result, executedToolCalls, streamedContent });
    } catch (err: unknown) {
      return this.handleRunError({ err, options, stream, executedToolCalls, streamedContent });
    } finally {
      this.pendingToolCallCycle = null;
      this.pendingDangerConfirmation = null;
      this.pendingLimitDecision = null;
      this.activeWebview = undefined;
      this.activeTrustScope = undefined;
      this.activePermissionSnapshot = undefined;
    }
  }

  cancel(): void {
    this.pendingLimitDecision?.("stop");
    this.pendingLimitDecision = null;
    if (this.pendingToolCallCycle) {
      for (const [toolCallId, toolCall] of this.pendingToolCallCycle.toolCalls) {
        if (!this.pendingToolCallCycle.resolved.has(toolCallId)) {
          void this.activeWebview?.webview.postMessage({
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
      void this.activeWebview?.webview.postMessage({
        type: "toolCallResult",
        toolCallId: this.pendingDangerConfirmation.toolCall.id,
        toolName: this.pendingDangerConfirmation.toolCall.function.name,
        result: "Cancelled with the active generation.",
        isError: false,
        status: "cancelled",
      });
      this.pendingDangerConfirmation.resolve({ confirmed: false, trustForSession: false });
    }
    this.pendingToolCallCycle = null;
    this.pendingDangerConfirmation = null;
    if (this.activeTrustScope) {
      this.dangerTrustStore.clearScope(this.activeTrustScope);
    }
  }

  handleUserAction(payload: ToolCallActionPayload): void {
    if (this.pendingDangerConfirmation?.toolCall.id === payload.toolCallId) {
      this.pendingDangerConfirmation.resolve({
        confirmed: payload.action === "execute",
        trustForSession: payload.action === "execute" ? payload.trustForSession : false,
      });
      void this.activeWebview?.webview.postMessage({
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
      this.activeWebview?.webview.postMessage({
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

  private requestLimitDecision(webviewView: vscode.WebviewView, completedRounds: number, batchSize: number): Promise<ToolCallLimitDecision> {
    if (this.pendingLimitDecision) {
      return Promise.resolve("stop");
    }
    webviewView.webview.postMessage({ type: "toolCallLimitReached", completedRounds, batchSize });
    return new Promise((resolve) => {
      this.pendingLimitDecision = resolve;
    });
  }

  private shouldDelegateLimitDecision(): boolean {
    return this.activePermissionSnapshot?.permissionMode === "auto-approve" ||
      this.activePermissionSnapshot?.permissionMode === "full-access";
  }

  private createExecutionContext(options: ToolCallRunOptions, executedToolCalls: Map<string, StoredExecution>) {
    return {
      toolExecutor: this.toolExecutor,
      webviewView: options.webviewView,
      executedToolCalls,
      signal: options.signal,
      autoApproveMode: this.activePermissionSnapshot?.permissionMode === "auto-approve",
      fullAccessMode: this.activePermissionSnapshot?.permissionMode === "full-access",
      isWorkspaceTrusted: options.isWorkspaceTrusted,
      getToolMode: (toolName: string) => getToolModeForPermissionSnapshot(this.activePermissionSnapshot ?? options.permissionSnapshot, toolName),
      getCurrentRound: () => this.currentRound,
      getPendingCycle: () => this.pendingToolCallCycle,
      isDangerTrusted: (toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult) => this.isDangerTrusted(toolCall, confirmationResult),
      trustDangerForSession: (toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult) => {
        if (this.activeTrustScope) {
          this.dangerTrustStore.trust(this.activeTrustScope, toolCall, confirmationResult);
        }
      },
      requestDangerConfirmation: (
        toolCall: ToolCall,
        confirmationResult: ConfirmationRequiredResult,
        dangerOptions?: { announceStarted?: boolean; round?: number },
      ) =>
        requestDangerConfirmation({
          webviewView: options.webviewView,
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
          localAnalysis: confirmationResult,
          providerConfig: options.providerConfig,
          originalUserRequest: getOriginalUserRequest(options.messages),
          workspaceRoot: confirmationResult.workspaceRoot ?? getToolWorkspaceHost().getRootPath?.(),
          signal: options.signal,
        }),
    };
  }

  private isDangerTrusted(toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult): boolean {
    return this.activeTrustScope !== undefined && this.dangerTrustStore.isTrusted(this.activeTrustScope, toolCall, confirmationResult);
  }

  private async handleRoundStart(round: number, toolCalls: ToolCall[], options: ToolCallRunOptions): Promise<void> {
    this.currentRound = round;
    options.webviewView.webview.postMessage({ type: "toolCallStarted", toolCalls, round });

    const snapshot = this.activePermissionSnapshot ?? options.permissionSnapshot;
    const manualToolCalls = snapshot.permissionMode === "auto-approve" || snapshot.permissionMode === "full-access"
      ? []
      : toolCalls.filter((toolCall) => getToolModeForPermissionSnapshot(snapshot, toolCall.function.name) === "enabled");
    if (manualToolCalls.length === 0) {
      return;
    }

    const pendingCycle = createPendingToolCallCycle(manualToolCalls, round);
    this.pendingToolCallCycle = pendingCycle;
    options.webviewView.webview.postMessage({
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

    if (result.finalMessage.content || toolCallResults.length > 0) {
      options.webviewView.webview.postMessage({
        type: "addMessage",
        message: {
          role: "assistant",
          content: hasStreamedContent ? "" : (result.finalMessage.content ?? ""),
          wasStreamed: hasStreamedContent,
          toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
          timeline,
        },
      });
    }

    stream.done({
      finish_reason: result.response.choices[0]?.finish_reason ?? "stop",
    });

    return {
      content: hasStreamedContent ? streamedContent : (result.finalMessage.content ?? ""),
      timeline,
      toolCalls: toolCallResults.length > 0 ? toolCallResults : undefined,
      providerTranscript: createProviderTranscript(result.transcript, "complete"),
    };
  }

  private handleRunError({ err, options, stream, executedToolCalls, streamedContent }: HandleRunErrorOptions): ToolCallRunResult | undefined {
    if (isCancellationError(err)) {
      for (const execution of executedToolCalls.values()) {
        if (execution.status === "pending" || execution.status === "awaiting_confirmation" || execution.status === "running") {
          execution.status = "cancelled";
          execution.isError = false;
          execution.requiresConfirmation = false;
          execution.result ??= "Cancelled with the active generation.";
          void options.webviewView.webview.postMessage({
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
          options.webviewView.webview.postMessage({
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
        stream.done({ cancelled: true });
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

    stream.error(`Error en tool calls: ${getErrorMessage(err)}`);
    return undefined;
  }
}

function isCancellationError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "Canceled");
}

function getErrorMessage(err: unknown): string {
  return redactSensitiveText(err);
}

function getOriginalUserRequest(messages: import("@/adapters").ChatMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role === "user" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return undefined;
}

function hasAutoApprovedTools(options: ToolCallRunOptions, tools: ToolDefinition[]): boolean {
  return options.permissionSnapshot.permissionMode === "auto-approve" ||
    options.permissionSnapshot.permissionMode === "full-access" ||
    tools.some((tool) => getToolModeForPermissionSnapshot(options.permissionSnapshot, tool.function.name) === "auto_approve");
}
