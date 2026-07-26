import type { ChatMessage, ToolDefinition } from "@/adapters";
import { MODEL_REGISTRY } from "@/adapters/deepseek/Models";

const UNKNOWN_MODEL_CONTEXT_TOKENS = 128_000;
const MINIMUM_SAFETY_MARGIN_TOKENS = 16_000;

export interface ContextBudget {
  contextTokens: number;
  outputTokens: number;
  safetyMarginTokens: number;
  inputTokens: number;
}

export function getContextBudget(model: string, requestedOutputTokens: number): ContextBudget {
  const modelInfo = MODEL_REGISTRY.find((entry) => entry.id === model);
  const contextTokens = modelInfo?.contextLength ?? UNKNOWN_MODEL_CONTEXT_TOKENS;
  const outputTokens = Math.max(
    1,
    Math.min(requestedOutputTokens, modelInfo?.maxOutputTokens ?? requestedOutputTokens),
  );
  const safetyMarginTokens = Math.max(
    MINIMUM_SAFETY_MARGIN_TOKENS,
    Math.ceil(contextTokens * 0.02),
  );
  return {
    contextTokens,
    outputTokens,
    safetyMarginTokens,
    inputTokens: Math.max(1, contextTokens - outputTokens - safetyMarginTokens),
  };
}

/**
 * Conservative UTF-8 estimate. It deliberately measures the exact request
 * shape, including hidden reasoning, tool schemas and tool arguments.
 */
export function estimateRequestTokens(
  messages: ChatMessage[],
  tools: ToolDefinition[] = [],
): number {
  return Math.ceil(Buffer.byteLength(JSON.stringify({ messages, tools }), "utf8") / 3);
}

export function requestFitsContext(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model: string,
  requestedOutputTokens: number,
): boolean {
  return estimateRequestTokens(messages, tools) <=
    getContextBudget(model, requestedOutputTokens).inputTokens;
}

export function assertRequestFitsContext(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  model: string,
  requestedOutputTokens: number,
): void {
  const estimated = estimateRequestTokens(messages, tools);
  const budget = getContextBudget(model, requestedOutputTokens);
  if (estimated > budget.inputTokens) {
    throw new Error(
      `The active tool cycle needs approximately ${estimated.toLocaleString()} input tokens, ` +
      `but ${model} has ${budget.inputTokens.toLocaleString()} available after reserving output and safety margin. ` +
      "The tool protocol cannot be truncated safely; start a new message with fewer references.",
    );
  }
}
