import { createSystemMessage, ensureSingleSystemPrompt, getTextContent } from "@/contracts/deepseek/Chat";
import type { ChatMessage } from "@/contracts";
import { createToolResultMessage, validateToolCall } from "./ToolCallMessages";
import type {
  RunToolCallCycleOptions,
  ToolCallCycleOptions,
  ToolCallCycleResult,
  ToolRoundLimitDecision,
} from "./ToolCallTypes";
import { fitToolResultForModel } from "./ToolResultBudget";

export async function runToolCallCycle(options: RunToolCallCycleOptions): Promise<ToolCallCycleResult> {
  const { initialMessages, tools, model, modelClient, executeToolCall, cycleOptions = {} } = options;

  const maxRounds = cycleOptions.maxRounds ?? 10;
  const maxToolCallsPerBatch = cycleOptions.maxToolCallsPerBatch ?? maxRounds * 4;
  let messages = ensureSingleSystemPrompt(initialMessages, createSystemMessage);
  const transcript: ChatMessage[] = [];
  let toolCallsExecuted = 0;
  let batchStartRound = 0;
  let batchToolCalls = 0;
  let completionRecoveryUsed = false;
  const executedSignatures = new Set<string>();
  const seenProviderToolCallIds = new Set<string>();

  for (let round = 0; ; round++) {
    if (cycleOptions.signal?.aborted) {
      throw createAbortError();
    }

    const reasoningTools = await cycleOptions.getToolsForRound?.("reasoning", round + 1) ?? tools;
    messages = await prepareRequestContext(messages, reasoningTools, round + 1, cycleOptions);
    cycleOptions.validateRequestBudget?.(messages, reasoningTools);
    cycleOptions.budgetManager?.resetOutput();
    const shouldStream = cycleOptions.streamFinalResponse === true;
    let response;
    if (shouldStream) {
      // The streaming implementation reports once in a finally block so usage
      // is retained even when the terminal marker is missing.
      response = await modelClient.streamRound({ messages, tools: reasoningTools, model, cycleOptions, emitStreamEvents: true });
    } else {
      response = await modelClient.completeRound({ messages, tools: reasoningTools, model, cycleOptions });
    }
    const message = response.choices[0].message;
    const finishReason = response.choices[0].finish_reason;
    if (message.tool_calls?.length && finishReason !== "tool_calls") {
      throw new Error(
        finishReason === "length"
          ? "DeepSeek reached its output limit before completing a tool call. No truncated tool was executed."
          : `DeepSeek ended with ${String(finishReason)} before completing its tool-call protocol. No tool was executed.`,
      );
    }
    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (
        finishReason === "stop" &&
        !completionRecoveryUsed &&
        isIncompleteActionAnnouncement(getTextContent(message.content))
      ) {
        completionRecoveryUsed = true;
        messages[0] = withCompletionRecoveryInstruction(messages[0]);
        cycleOptions.onStreamChunk?.("\n\n");
        continue;
      }
      transcript.push(structuredClone(message));
      cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "complete");
      return {
        finalMessage: message,
        rounds: round + 1,
        toolCallsExecuted,
        response,
        transcript,
      };
    }

    assertUniqueToolCallIds(message.tool_calls, seenProviderToolCallIds);
    for (const toolCall of message.tool_calls) {seenProviderToolCallIds.add(toolCall.id);}
    assertValidToolArguments(message);
    const toolRoundTools = await cycleOptions.getToolsForRound?.("tools", round + 1) ?? reasoningTools;
    const enforceToolCallLimits = cycleOptions.shouldEnforceToolCallLimits?.() ?? true;
    const availableTools = new Map(toolRoundTools.map((tool) => [tool.function.name, tool]));
    const executableToolCalls = message.tool_calls.filter(
      (toolCall) => validateToolCall(toolCall, availableTools).valid && !executedSignatures.has(createToolSignature(toolCall)),
    );
    if (executableToolCalls.length > 0) {
      await cycleOptions.onRoundStart?.(round + 1, executableToolCalls);
    }
    messages.push(message);
    transcript.push(structuredClone(message));
    cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");

    for (const toolCall of message.tool_calls) {
      if (cycleOptions.signal?.aborted) {
        throw createAbortError();
      }

      const validation = validateToolCall(toolCall, availableTools);
      if (!validation.valid) {
        const invalidResult = createToolResultMessage(toolCall.id, toolCall.function.name, `Error: ${validation.error}`);
        messages.push(invalidResult);
        transcript.push(structuredClone(invalidResult));
        cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");
        continue;
      }

      const signature = createToolSignature(toolCall);
      if (executedSignatures.has(signature)) {
        const duplicateResult = createToolResultMessage(toolCall.id, toolCall.function.name, "Skipped: identical tool call already executed in this cycle.");
        messages.push(duplicateResult);
        transcript.push(structuredClone(duplicateResult));
        cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");
        continue;
      }
      if (enforceToolCallLimits && batchToolCalls >= maxToolCallsPerBatch) {
        const skipped = `Skipped: this generation reached its ${maxToolCallsPerBatch}-tool budget for the current block. Wait for the user to authorize another block before retrying any necessary operation.`;
        cycleOptions.onToolSkipped?.(toolCall, skipped);
        const skippedResult = createToolResultMessage(toolCall.id, toolCall.function.name, skipped);
        messages.push(skippedResult);
        transcript.push(structuredClone(skippedResult));
        cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");
        continue;
      }

      // Calls are intentionally sequential: writes preserve model order and manual approvals can advance one at a time.
      const result = await executeToolCall(toolCall);
      toolCallsExecuted++;
      if (enforceToolCallLimits) {batchToolCalls++;}
      if (shouldRememberToolSignature(toolCall, result)) {executedSignatures.add(signature);}
      cycleOptions.onToolResult?.(toolCall.id, result);
      const toolResult = createToolResultMessage(toolCall.id, toolCall.function.name, fitToolResultForModel(result));
      messages.push(toolResult);
      transcript.push(structuredClone(toolResult));
      cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");
    }

    const completedRounds = round + 1;
    if (!enforceToolCallLimits) {
      batchStartRound = completedRounds;
      batchToolCalls = 0;
      continue;
    }
    const completedBatchRounds = completedRounds - batchStartRound;
    if (completedBatchRounds >= maxRounds || batchToolCalls >= maxToolCallsPerBatch) {
      const decision = await requestToolRoundLimitDecision(
        cycleOptions.onLimitReached,
        completedRounds,
        maxRounds,
        batchToolCalls,
        maxToolCallsPerBatch,
      );
      if (decision === "stop") {
        let finalMessages = withToolFreeFinalInstruction(messages);
        finalMessages = await prepareRequestContext(finalMessages, [], completedRounds + 1, cycleOptions);
        cycleOptions.validateRequestBudget?.(finalMessages, []);
        const finalResponse = await modelClient.streamRound({
          messages: finalMessages,
          tools: [],
          model,
          cycleOptions,
          emitStreamEvents: true,
        });
        const finalMessage = finalResponse.choices[0].message;
        transcript.push(structuredClone(finalMessage));
        cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "complete");
        return {
          finalMessage,
          rounds: completedRounds,
          toolCallsExecuted,
          response: finalResponse,
          transcript,
        };
      }
      messages[0] = withToolRoundCheckpointInstruction(messages[0], completedRounds, batchToolCalls);
      batchStartRound = completedRounds;
      batchToolCalls = 0;
    }
  }
}

export function isIncompleteActionAnnouncement(content: string | null | undefined): boolean {
  const normalized = content?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized || normalized.length > 800) {return false;}
  return /\b(?:let me|i(?:'ll| will| need to| am going to)|d[eé]jame|voy a|necesito)\s+(?:check|search|look(?:\s+up)?|inspect|read|verify|find|investigate|review|comprobar|buscar|revisar|consultar|verificar|investigar)(?:\s+[^.!?]{0,180})?[.!?]?\s*$/i.test(normalized);
}

function assertValidToolArguments(message: ChatMessage): void {
  for (const toolCall of message.tool_calls ?? []) {
    try {
      JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(`DeepSeek returned invalid JSON arguments for tool "${toolCall.function.name}".`);
    }
  }
}

export async function requestToolRoundLimitDecision(
  onLimitReached: ToolCallCycleOptions["onLimitReached"],
  completedRounds: number,
  batchSize: number,
  completedToolCalls = 0,
  toolCallBudget = batchSize * 4,
): Promise<ToolRoundLimitDecision> {
  return onLimitReached ? onLimitReached(completedRounds, batchSize, completedToolCalls, toolCallBudget) : "stop";
}

async function prepareRequestContext(
  messages: ChatMessage[],
  tools: Parameters<NonNullable<ToolCallCycleOptions["prepareRequestContext"]>>[1],
  round: number,
  cycleOptions: ToolCallCycleOptions,
): Promise<ChatMessage[]> {
  const replacement = await cycleOptions.prepareRequestContext?.(messages, tools, round);
  return replacement ? ensureSingleSystemPrompt(replacement, createSystemMessage) : messages;
}

function assertUniqueToolCallIds(
  toolCalls: readonly { id: string }[],
  previouslySeen: ReadonlySet<string>,
): void {
  const current = new Set<string>();
  for (const toolCall of toolCalls) {
    if (!toolCall.id || current.has(toolCall.id) || previouslySeen.has(toolCall.id)) {
      throw new Error(`DeepSeek returned a duplicate or empty tool-call ID: "${toolCall.id}".`);
    }
    current.add(toolCall.id);
  }
}

function withToolRoundCheckpointInstruction(
  systemMessage: ChatMessage,
  completedRounds: number,
  completedToolCalls: number,
): ChatMessage {
  const contentWithoutPreviousCheckpoint = getTextContent(systemMessage.content).replace(
    /\n\n<tool_round_checkpoint>[\s\S]*?<\/tool_round_checkpoint>/g,
    "",
  );
  const checkpointInstruction =
    `\n\n<tool_round_checkpoint>The user explicitly authorized another block after ${completedRounds} tool rounds and ${completedToolCalls} tool calls. The work is taking longer than expected. ` +
    "Before doing anything else, reassess the user's goal and the tool results. " +
    "Continue with tool calls only if concrete, necessary work remains and there is a clear next action. " +
    "If progress requires missing information or a material user choice, do not call another tool; ask the user for the needed instructions. " +
    "If the goal is complete, further progress is unlikely, or another call would only repeat or verify successful work, stop using tools and provide the best final response.</tool_round_checkpoint>";
  return {
    ...systemMessage,
    content: `${contentWithoutPreviousCheckpoint}${checkpointInstruction}`,
  };
}

function withCompletionRecoveryInstruction(systemMessage: ChatMessage): ChatMessage {
  return {
    ...systemMessage,
    content: `${systemMessage.content ?? ""}\n\n<completion_recovery>The previous response stopped after announcing an action without performing it. Continue the same turn now. Either issue the necessary tool call or provide the complete final answer in the language of the user's latest message. Do not announce another future action.</completion_recovery>`,
  };
}

function withToolFreeFinalInstruction(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) =>
    index === 0 && message.role === "system"
      ? {
          ...message,
          content: `${message.content ?? ""}\n\nThe user chose to stop tool execution after reaching the tool-call round limit. Do not request or imply any further tool use. Provide the best final response now using the conversation and tool results already available, and clearly mention anything that remains incomplete.`,
        }
      : message,
  );
}

function createToolSignature(toolCall: { function: { name: string; arguments: string } }): string {
  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    if (toolCall.function.name === "edit_file") {
      if (typeof args.search === "string") {args.search = normalizeSignatureLineEndings(args.search);}
      if (typeof args.replace === "string") {args.replace = normalizeSignatureLineEndings(args.replace);}
    }
    if (toolCall.function.name === "apply_patch" && typeof args.diff === "string") {
      args.diff = normalizeSignatureLineEndings(args.diff);
    }
    return `${toolCall.function.name}\u0000${stableStringify(args)}`;
  } catch {
    return `${toolCall.function.name}\u0000${toolCall.function.arguments.trim()}`;
  }
}

function normalizeSignatureLineEndings(value: string): string {return value.replace(/\r\n|\r/g, "\n");}

function shouldRememberToolSignature(toolCall: { function: { name: string } }, result: string): boolean {
  if (toolCall.function.name === "read_file") {return false;}
  return !/^\s*(?:Error\b|Skipped:)/i.test(result);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {return `[${value.map(stableStringify).join(",")}]`;}
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createAbortError(): Error {
  const error = new Error("Tool call cycle aborted");
  error.name = "AbortError";
  return error;
}
