import type { ChatMessage, ToolCall, ToolDefinition } from "@/adapters";
import type { ChatResponse } from "../Chat";

export interface ToolCallResult {
  role: "tool";
  tool_call_id: string;
  content: string;
  name: string;
}

export interface ToolCallCycleOptions {
  getToolsForRound?: (phase: "reasoning" | "tools", round: number) => Promise<ToolDefinition[]> | ToolDefinition[];
  maxRounds?: number;
  onRoundStart?: (round: number, toolCalls: ToolCall[]) => Promise<void> | void;
  onToolResult?: (toolCallId: string, result: string) => void;
  onTranscriptUpdate?: (messages: ChatMessage[], status: "complete" | "incomplete") => void;
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
  onLimitReached?: (completedRounds: number, batchSize: number) =>
    Promise<ToolRoundLimitDecision> | ToolRoundLimitDecision;
}

export type ToolRoundLimitDecision = "continue" | "delegate" | "stop";

export interface ToolCallCycleResult {
  finalMessage: ChatMessage;
  rounds: number;
  toolCallsExecuted: number;
  response: ChatResponse;
  transcript: ChatMessage[];
}

export type ToolExecutor = (toolCall: ToolCall) => Promise<string>;

export interface RunToolCallCycleOptions {
  initialMessages: ChatMessage[];
  tools: ToolDefinition[];
  model: string;
  apiKey: string;
  baseUrl: string;
  executeToolCall: ToolExecutor;
  cycleOptions?: ToolCallCycleOptions;
}
