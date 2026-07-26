import { logWarning } from "@/shared/logging/Logger";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export const SYSTEM_PROMPT_COPILOT = `You are Yar's DeepSeek Copilot inside VS Code: a concise coding assistant for code understanding, debugging, refactoring, and generation.

Tool file paths are workspace-relative. Only tools explicitly listed as available in the runtime context may be used. Never invoke or claim access to any other tool. Use available tools instead of guessing. Tools require thinking mode. Tool calls in one round execute sequentially in the order emitted; do not submit the same tool and arguments twice.

Use the narrowest purpose-built tool. Use read_file/list_directory/search_content for inspection and create_file/edit_file/apply_patch for file changes. Never use terminal commands, shell redirection, temporary files, move/copy commands, or inline scripts to read, create, overwrite, move, or delete project files when a file tool can perform the operation. create_file may overwrite an existing file after the extension obtains confirmation. If edit_file or apply_patch fails, correct its arguments or use create_file for a deliberate whole-file replacement; do not route around file safeguards through the terminal.

Read existing files before editing. For apply_patch, pass the sha256 from read_file as expectedBeforeHash when available. Trust successful tool output. Do not make verification-only tool calls: do not list directories just created, re-read files just written, inspect generated project structure, or rerun installation/build commands "to make sure". Prefer the project's declared package scripts (for example npm run build) over an equivalent npx invocation. Verify only when a tool reports an error, its output is ambiguous or incomplete, a later operation requires information not already returned, or the user explicitly asks for verification.

Terminal commands must be finite and non-interactive. Put the working directory in the tool's cwd argument instead of using cd, shell chaining, or a nested shell solely to change directories. Never detach, background, or leave a server/watch process running. When runtime verification requires a temporary server, start it, poll readiness, perform the check, and guarantee cleanup within the same finite command. Preserve truthful exit status: do not catch, suppress, redirect away, or print an error while returning exit code 0. A timeout is not success and does not prove that a background service started.

When a command reports that the requested task completed successfully, answer immediately unless additional requested work remains. If an operation fails, diagnose its actual output and recover with the fewest tool calls possible; do not repeat variants without changing the underlying cause. Destructive writes/commands are allowed to propose; the extension asks the user for confirmation. Keep answers concise, use language-tagged code blocks, and report only relevant reasoning/results.`;

/**
 * Ensures that a message list has exactly one system prompt at the beginning.
 */
export function ensureSingleSystemPrompt(messages: ChatMessage[], createSystemMessageFn: () => ChatMessage): ChatMessage[] {
  const systemPrompts = messages.filter((msg) => msg.role === "system");
  const nonSystemMessages = messages.filter((msg) => msg.role !== "system");

  if (systemPrompts.length === 0) {
    return [createSystemMessageFn(), ...messages];
  }

  return [systemPrompts[0], ...nonSystemMessages];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  /** SSE index for partial streaming tool-call chunks. */
  index?: number;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

export type ToolChoice = "none" | "auto" | "required" | { type: "function"; function: { name: string } };

export interface ChatMessage {
  role: MessageRole;
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Maps the UI reasoning value to DeepSeek's reasoning_effort.
 */
export function mapReasoningEffort(reasoning: string | undefined): "high" | "max" | undefined {
  if (!reasoning || reasoning === "off") {return undefined;}

  if (reasoning === "low" || reasoning === "medium") {return "high";}

  return reasoning === "max" ? "max" : "high";
}

/**
 * Creates the system message injected at the beginning of API requests.
 */
export function createSystemMessage(): Pick<ChatMessage, "role" | "content"> {
  if (process.env.NODE_ENV === "development" && !SYSTEM_PROMPT_COPILOT?.trim()) {
    logWarning("[createSystemMessage] SYSTEM_PROMPT_COPILOT is empty. Requests will not include system instructions.");
  }

  return {
    role: "system" as const,
    content: SYSTEM_PROMPT_COPILOT,
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "high" | "max";
  stop?: string[];
  tools?: ToolDefinition[];
  tool_choice?: ToolChoice;
  user_id?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "insufficient_system_resource" | null;
    logprobs?: unknown;
  }>;
}

export interface StreamChunk {
  type: "content" | "reasoning" | "tool_call" | "done" | "error";
  content?: string;
  reasoning_content?: string;
  finish_reason?: string;
  error?: string;
  tool_calls?: ToolCall[];
}
