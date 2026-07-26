import type * as vscode from "vscode";
import type { AppConfig, AssistantTimelineEvent, ChatMessage, PermissionSnapshot, ToolCall, ToolDefinition, ToolExecutionMode } from "@/adapters";
import type { ToolCallCycleResult } from "@/deepseekApi/providers/deepseek/features/toolCall";
import type { ToolExecutor } from "@/core/tools/ToolExecutor";
import type { ConfirmationRequiredResult, ExecutionResult } from "@/core/tools/Types";
import type { StreamEventEmitter } from "../StreamEventEmitter";
import type { DangerTrustScope } from "./DangerTrustStore";
import type { ProviderTranscript } from "@/core/chat/ProviderTranscript";

export interface PendingToolCallCycle {
  toolCalls: Map<string, ToolCall>;
  round: number;
  individualResolves: Map<string, (action: ToolCallAction) => void>;
  individualPromises: Map<string, Promise<ToolCallAction>>;
  resolved: Set<string>;
}

export interface PendingDangerConfirmation {
  toolCall: ToolCall;
  resolve: (decision: DangerConfirmationDecision) => void;
  confirmationResult: ConfirmationRequiredResult;
}

export type ToolCallAction = "execute" | "reject";
export type ToolCallLimitDecision = "continue" | "stop";

export interface ToolCallActionPayload {
  toolCallId: string;
  action: ToolCallAction;
  trustForSession?: boolean;
}

export interface DangerConfirmationDecision {
  confirmed: boolean;
  trustForSession?: boolean;
}

export interface StoredExecution {
  toolCallId: string;
  toolName: string;
  arguments: string;
  result?: string;
  isError?: boolean;
  round?: number;
  rejected?: boolean;
  requiresConfirmation?: boolean;
  dangerLevel?: string;
  dangerConfirmed?: boolean;
  status: "pending" | "awaiting_confirmation" | "running" | "completed" | "rejected" | "cancelled" | "error";
}

export interface ToolCallRunOptions {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  providerConfig: AppConfig;
  webviewView: vscode.WebviewView;
  permissionSnapshot: PermissionSnapshot;
  capturePermissionSnapshot: () => Promise<PermissionSnapshot>;
  onPermissionSnapshot?: (snapshot: PermissionSnapshot) => void;
  onTranscriptUpdate?: (transcript: ProviderTranscript) => void;
  exposeReasoning: boolean;
  signal?: AbortSignal;
  isCancelling: () => boolean;
  trustScope: DangerTrustScope;
  isWorkspaceTrusted: () => boolean;
}

export interface ToolCallRunResult {
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls?: StoredExecution[];
  partial?: boolean;
  providerTranscript?: ProviderTranscript;
}

export interface ToolExecutionContext {
  toolExecutor: ToolExecutor;
  webviewView: vscode.WebviewView;
  executedToolCalls: Map<string, StoredExecution>;
  signal?: AbortSignal;
  autoApproveMode: boolean;
  fullAccessMode: boolean;
  isWorkspaceTrusted: () => boolean;
  getToolMode: (toolName: string) => ToolExecutionMode;
  getCurrentRound: () => number;
  getPendingCycle: () => PendingToolCallCycle | null;
  requestDangerConfirmation: (
    toolCall: ToolCall,
    confirmationResult: ConfirmationRequiredResult,
    options?: { announceStarted?: boolean; round?: number },
  ) => Promise<DangerConfirmationDecision>;
  isDangerTrusted: (toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult) => boolean;
  trustDangerForSession: (toolCall: ToolCall, confirmationResult: ConfirmationRequiredResult) => void;
}

export interface HandleExecutionResultOptions {
  toolCall: ToolCall;
  result: ExecutionResult;
  ctx: ToolExecutionContext;
  announceStarted?: boolean;
  round: number;
}

export interface PostFinalMessageOptions {
  options: ToolCallRunOptions;
  stream: StreamEventEmitter;
  result: ToolCallCycleResult;
  executedToolCalls: Map<string, StoredExecution>;
  streamedContent: string;
}

export interface HandleRunErrorOptions {
  err: unknown;
  options: ToolCallRunOptions;
  stream: StreamEventEmitter;
  executedToolCalls: Map<string, StoredExecution>;
  streamedContent: string;
}
