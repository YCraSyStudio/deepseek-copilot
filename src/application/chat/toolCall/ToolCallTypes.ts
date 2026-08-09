import type { ChatCompletionResponse, ChatMessage, ToolCall, ToolDefinition } from "@/contracts";
import type { ProviderUsage } from "@/shared/usage/Usage";
import type { GenerationBudgetManager } from "@/application/chat/context/GenerationBudgetManager";

export interface ToolCallResult {
  role: "tool";
  tool_call_id: string;
  content: string;
  name: string;
}

export interface ToolCallCycleOptions {
  getToolsForRound?: (phase: "reasoning" | "tools", round: number) => Promise<ToolDefinition[]> | ToolDefinition[];
  maxRounds?: number;
  maxToolCallsPerBatch?: number;
  shouldEnforceToolCallLimits?: () => boolean;
  onRoundStart?: (round: number, toolCalls: ToolCall[]) => Promise<void> | void;
  onToolResult?: (toolCallId: string, result: string) => void;
  onToolSkipped?: (toolCall: ToolCall, result: string) => void;
  onTranscriptUpdate?: (messages: ChatMessage[], status: "complete" | "incomplete") => void;
  onUsage?: (usage?: ProviderUsage) => void;
  /** Runs only at a protocol-safe boundary, after every emitted tool call has a terminal result. */
  prepareRequestContext?: (
    messages: ChatMessage[],
    tools: ToolDefinition[],
    round: number,
  ) => Promise<ChatMessage[] | undefined> | ChatMessage[] | undefined;
  validateRequestBudget?: (messages: ChatMessage[], tools: ToolDefinition[]) => void;
  signal?: AbortSignal;
  streamFinalResponse?: boolean;
  streamToolCallRounds?: boolean;
  onStreamChunk?: (content: string) => void;
  onStreamReasoning?: (content: string) => void;
  thinkingMode?: boolean;
  reasoningEffort?: "high" | "max";
  maxTokens?: number;
  userId?: string;
  budgetManager?: GenerationBudgetManager;
  onRecoveryStarted?: () => Promise<void> | void;
  onLimitReached?: (completedRounds: number, batchSize: number, completedToolCalls: number, toolCallBudget: number) =>
    Promise<ToolRoundLimitDecision> | ToolRoundLimitDecision;
}

export type ToolRoundLimitDecision = "continue" | "stop";

export interface ToolCallCycleResult {
  finalMessage: ChatMessage;
  rounds: number;
  toolCallsExecuted: number;
  response: ChatCompletionResponse;
  transcript: ChatMessage[];
}

export type ToolExecutor = (toolCall: ToolCall) => Promise<string>;

export interface ToolCallModelRoundOptions {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  model: string;
  cycleOptions: ToolCallCycleOptions;
  emitStreamEvents?: boolean;
}

export interface ToolCallModelClient {
  completeRound(options: ToolCallModelRoundOptions): Promise<ChatCompletionResponse>;
  streamRound(options: ToolCallModelRoundOptions): Promise<ChatCompletionResponse>;
}

export interface RunToolCallCycleOptions {
  initialMessages: ChatMessage[];
  tools: ToolDefinition[];
  model: string;
  modelClient: ToolCallModelClient;
  executeToolCall: ToolExecutor;
  cycleOptions?: ToolCallCycleOptions;
}
