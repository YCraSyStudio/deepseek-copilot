import type { ToolCall } from "@/adapters";
import { ToolRegistry } from "./ToolRegistry";
import { FORCED_HANDLERS } from "./definitions";
import type { DangerLevel, ExecutionResult, ConfirmationRequiredResult, ToolHandlerContext } from "./Types";
import { getToolWorkspaceHost } from "./ToolWorkspace";

const READ_ONLY_TOOLS = new Set(["read_file", "list_directory", "search_content"]);
const workspaceMutationQueues = new Map<string, Promise<void>>();

/**
 * Executes tool calls and propagates handler-level confirmation requests.
 */
export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  /**
   * Validate and execute a tool call.
   */
  async execute(toolCall: ToolCall, context: ToolHandlerContext = {}): Promise<ExecutionResult> {
    if (!READ_ONLY_TOOLS.has(toolCall.function.name)) {
      return runWorkspaceMutation(() => this.executeInternal(toolCall, context));
    }
    return this.executeInternal(toolCall, context);
  }

  private async executeInternal(toolCall: ToolCall, context: ToolHandlerContext): Promise<ExecutionResult> {
    const validation = this.registry.validate(toolCall);

    if (!validation.valid) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: validation.error!,
        isError: true,
      };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const registeredTool = this.registry.get(toolCall.function.name)!;
      const result = await registeredTool.handler(args, context);

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = null;
      }

      if (isConfirmationRequiredResult(parsedResult)) {
        const confirmationResult: ConfirmationRequiredResult = {
          requiresConfirmation: true,
          dangerLevel: parsedResult.dangerLevel,
          warningMessage: parsedResult.warningMessage,
          command: parsedResult.command,
          filePath: parsedResult.filePath,
          cwd: parsedResult.cwd,
          shell: parsedResult.shell,
          beforeHash: parsedResult.beforeHash,
          reasonCode: parsedResult.reasonCode,
          normalizedCommand: parsedResult.normalizedCommand,
          workspaceContained: parsedResult.workspaceContained,
        };

        return {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result: JSON.stringify(confirmationResult),
          isError: false,
        };
      }

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result,
        isError: isToolErrorResult(result, parsedResult),
      };
    } catch (err: unknown) {
      if (isCancellationError(err)) {
        throw err;
      }
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: `Error executing ${toolCall.function.name}: ${getErrorMessage(err)}`,
        isError: true,
      };
    }
  }

  /**
   * Execute a tool call after explicit user confirmation.
   */
  async executeForced(toolCall: ToolCall, context: ToolHandlerContext = {}): Promise<ExecutionResult> {
    if (!READ_ONLY_TOOLS.has(toolCall.function.name)) {
      return runWorkspaceMutation(() => this.executeForcedInternal(toolCall, context));
    }
    return this.executeForcedInternal(toolCall, context);
  }

  private async executeForcedInternal(toolCall: ToolCall, context: ToolHandlerContext): Promise<ExecutionResult> {
    const validation = this.registry.validate(toolCall);

    if (!validation.valid) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: validation.error!,
        isError: true,
      };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const registeredTool = this.registry.get(toolCall.function.name)!;

      const handler = FORCED_HANDLERS[toolCall.function.name] || registeredTool.handler;
      const result = await handler(args, context);

      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result,
        isError: isToolErrorResult(result),
      };
    } catch (err: unknown) {
      if (isCancellationError(err)) {
        throw err;
      }
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: `Error executing ${toolCall.function.name}: ${getErrorMessage(err)}`,
        isError: true,
      };
    }
  }

  /** Execute multiple tool calls from the same turn in parallel. */
  async executeAll(toolCalls: ToolCall[]): Promise<ExecutionResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc)));
  }

  /**
   * Check whether an execution result requests confirmation.
   */
  static isConfirmationRequired(result: string): ConfirmationRequiredResult | null {
    try {
      const parsed: unknown = JSON.parse(result);
      if (isConfirmationRequiredResult(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

async function runWorkspaceMutation<T>(operation: () => Promise<T>): Promise<T> {
  const workspace = getToolWorkspaceHost();
  const key = workspace.getWorkspaceId?.() ?? workspace.getRootPath() ?? "workspace:unknown";
  const previous = workspaceMutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current, () => current);
  workspaceMutationQueues.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceMutationQueues.get(key) === tail) {
      workspaceMutationQueues.delete(key);
    }
  }
}

function isCancellationError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "Canceled");
}

function isConfirmationRequiredResult(value: unknown): value is ConfirmationRequiredResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as Partial<ConfirmationRequiredResult>;
  return result.requiresConfirmation === true && isDangerLevel(result.dangerLevel) && typeof result.warningMessage === "string";
}

function isDangerLevel(value: unknown): value is DangerLevel {
  return value === "safe" || value === "caution" || value === "dangerous" || value === "destructive";
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function isStructuredCommandError(value: unknown): boolean {
  if (!value || typeof value !== "object") {return false;}
  const result = value as { kind?: unknown; exitCode?: unknown; timedOut?: unknown; cancelled?: unknown };
  return result.kind === "command_result" && (result.exitCode !== 0 || result.timedOut === true || result.cancelled === true);
}

function isToolErrorResult(result: string, parsedResult: unknown = parseJson(result)): boolean {
  return isStructuredCommandError(parsedResult) || /^\s*Error(?:\s|:)/i.test(result);
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
