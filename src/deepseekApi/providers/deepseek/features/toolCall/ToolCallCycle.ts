import { createSystemMessage, ensureSingleSystemPrompt } from "@/adapters/deepseek/Chat";
import type { ChatMessage } from "@/adapters";
import { chatCompletion } from "../Chat";
import { createToolResultMessage, validateToolCall } from "./ToolCallMessages";
import { buildToolCallRequest } from "./ToolCallRequest";
import { streamToolCallRound } from "./ToolCallStreaming";
import type { RunToolCallCycleOptions, ToolCallCycleOptions, ToolCallCycleResult } from "./ToolCallTypes";

export async function runToolCallCycle(options: RunToolCallCycleOptions): Promise<ToolCallCycleResult> {
  const { initialMessages, tools, model, apiKey, baseUrl, executeToolCall, cycleOptions = {} } = options;

  const maxRounds = cycleOptions.maxRounds ?? 10;
  const messages = ensureSingleSystemPrompt(initialMessages, createSystemMessage);
  const transcript: ChatMessage[] = [];
  let toolCallsExecuted = 0;
  const executedSignatures = new Set<string>();

  for (let round = 0; ; round++) {
    if (cycleOptions.signal?.aborted) {
      throw createAbortError();
    }

    const reasoningTools = await cycleOptions.getToolsForRound?.("reasoning", round + 1) ?? tools;
    cycleOptions.validateRequestBudget?.(messages, reasoningTools);
    const shouldStream = cycleOptions.streamFinalResponse === true;
    const response = shouldStream
      ? await streamToolCallRound({ messages, tools: reasoningTools, model, apiKey, baseUrl, cycleOptions, emitStreamEvents: true })
      : await chatCompletion(
          buildToolCallRequest({
            model,
            messages,
            tools: reasoningTools,
            stream: false,
            cycleOptions,
          }),
          apiKey,
          baseUrl,
        );

    const message = response.choices[0].message;
    if (!message.tool_calls || message.tool_calls.length === 0) {
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

    assertValidToolArguments(message);
    const toolRoundTools = await cycleOptions.getToolsForRound?.("tools", round + 1) ?? reasoningTools;
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
      executedSignatures.add(signature);

      // Calls are intentionally sequential: writes preserve model order and manual approvals can advance one at a time.
      const result = await executeToolCall(toolCall);
      toolCallsExecuted++;
      cycleOptions.onToolResult?.(toolCall.id, result);
      const toolResult = createToolResultMessage(toolCall.id, toolCall.function.name, result);
      messages.push(toolResult);
      transcript.push(structuredClone(toolResult));
      cycleOptions.onTranscriptUpdate?.(structuredClone(transcript), "incomplete");
    }

    const completedRounds = round + 1;
    if (completedRounds % maxRounds === 0) {
      const decision = await requestToolRoundLimitDecision(cycleOptions.onLimitReached, completedRounds, maxRounds);
      if (decision === "stop") {
        const finalMessages = withToolFreeFinalInstruction(messages);
        cycleOptions.validateRequestBudget?.(finalMessages, []);
        const finalResponse = await streamToolCallRound({
          messages: finalMessages,
          tools: [],
          model,
          apiKey,
          baseUrl,
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
    }
  }
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
): Promise<"continue" | "stop"> {
  return onLimitReached ? onLimitReached(completedRounds, batchSize) : "stop";
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
  return `${toolCall.function.name}\u0000${toolCall.function.arguments.trim()}`;
}

function createAbortError(): Error {
  const error = new Error("Tool call cycle aborted");
  error.name = "AbortError";
  return error;
}
