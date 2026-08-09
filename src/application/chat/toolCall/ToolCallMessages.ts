import type { ChatMessage, ToolCall, ToolDefinition } from "@/contracts";
import type { ToolCallResult } from "./ToolCallTypes";

export function validateToolCall(toolCall: ToolCall, availableTools: Map<string, ToolDefinition>): { valid: boolean; error?: string } {
  const toolDef = availableTools.get(toolCall.function.name);
  if (!toolDef) {
    return { valid: false, error: `Unknown tool: ${toolCall.function.name}` };
  }

  try {
    JSON.parse(toolCall.function.arguments);
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid JSON arguments for ${toolCall.function.name}` };
  }
}

export function createToolResultMessage(toolCallId: string, name: string, result: string): ToolCallResult {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: result,
    name,
  };
}

export function hasToolResultMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === "tool");
}
