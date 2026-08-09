import type { ToolCall } from "@/contracts";
import { ToolRegistry } from "./ToolRegistry";
import type { DangerLevel, ExecutionResult, ConfirmationRequiredResult, ToolHandlerContext } from "./Types";
import type { ToolExecutionOutcome } from "@/domain/tools/ToolExecutionOutcome";
import { isCancellationError, throwIfAborted } from "@/shared/utils/Cancellation";

const READ_ONLY_TOOLS = new Set(["read_file", "list_directory", "search_content"]);
const workspaceMutationQueues = new Map<string, Promise<void>>();

/**
 * Executes tool calls and propagates handler-level confirmation requests.
 */
export class ToolExecutor {
  constructor(
    private registry: ToolRegistry,
    private readonly mutationScopeKey: () => string = () => "workspace:default",
  ) {}

  /** Read-only access to execution metadata used by the permission coordinator. */
  getMetadata(toolName: string): import("./Types").ToolMetadata | undefined {
    return this.registry.get(toolName)?.metadata;
  }

  /**
   * Validate and execute a tool call.
   */
  async execute(toolCall: ToolCall, context: ToolHandlerContext = {}): Promise<ExecutionResult> {
    throwIfAborted(context.signal);
    if (this.shouldSerializeWorkspaceMutation(toolCall.function.name)) {
      return runWorkspaceMutation(this.mutationScopeKey(), context.signal, () => this.executeInternal(toolCall, context));
    }
    return this.executeInternal(toolCall, context);
  }

  private async executeInternal(toolCall: ToolCall, context: ToolHandlerContext): Promise<ExecutionResult> {
    throwIfAborted(context.signal);
    const validation = this.registry.validate(toolCall);

    if (!validation.valid) {
      return createExecutionResult(toolCall, { kind: "error", content: validation.error! });
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
          workspaceRoot: parsedResult.workspaceRoot,
          shell: parsedResult.shell,
          beforeHash: parsedResult.beforeHash,
          reasonCode: parsedResult.reasonCode,
          normalizedCommand: parsedResult.normalizedCommand,
          workspaceContained: parsedResult.workspaceContained,
        };

        return createExecutionResult(toolCall, {
          kind: "confirmation_required",
          content: JSON.stringify(confirmationResult),
          dangerLevel: confirmationResult.dangerLevel,
        });
      }

      const outcome: ToolExecutionOutcome = isToolErrorResult(result, parsedResult)
        ? { kind: "error", content: result }
        : { kind: "completed", content: result };
      return createExecutionResult(toolCall, outcome);
    } catch (err: unknown) {
      if (isCancellationError(err, context.signal)) {
        throw err;
      }
      return createExecutionResult(toolCall, {
        kind: "error",
        content: `Error executing ${toolCall.function.name}: ${getErrorMessage(err)}`,
      });
    }
  }

  /**
   * Execute a tool call after explicit user confirmation.
   */
  async executeForced(toolCall: ToolCall, context: ToolHandlerContext = {}): Promise<ExecutionResult> {
    throwIfAborted(context.signal);
    if (this.shouldSerializeWorkspaceMutation(toolCall.function.name)) {
      return runWorkspaceMutation(this.mutationScopeKey(), context.signal, () => this.executeForcedInternal(toolCall, context));
    }
    return this.executeForcedInternal(toolCall, context);
  }

  private shouldSerializeWorkspaceMutation(toolName: string): boolean {
    return this.registry.get(toolName)?.metadata.scope !== "global" && !READ_ONLY_TOOLS.has(toolName);
  }

  private async executeForcedInternal(toolCall: ToolCall, context: ToolHandlerContext): Promise<ExecutionResult> {
    throwIfAborted(context.signal);
    const validation = this.registry.validate(toolCall);

    if (!validation.valid) {
      return createExecutionResult(toolCall, { kind: "error", content: validation.error! });
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const registeredTool = this.registry.get(toolCall.function.name)!;

      const handler = registeredTool.forcedHandler ?? registeredTool.handler;
      const result = await handler(args, context);

      return createExecutionResult(
        toolCall,
        isToolErrorResult(result)
          ? { kind: "error", content: result }
          : { kind: "completed", content: result },
      );
    } catch (err: unknown) {
      if (isCancellationError(err, context.signal)) {
        throw err;
      }
      return createExecutionResult(toolCall, {
        kind: "error",
        content: `Error executing ${toolCall.function.name}: ${getErrorMessage(err)}`,
      });
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

export function createExecutionResult(
  toolCall: Pick<ToolCall, "id" | "function">,
  outcome: ToolExecutionOutcome,
): ExecutionResult {
  const status = outcome.kind === "confirmation_required"
    ? "confirmation_required"
    : outcome.kind === "rejected"
      ? "rejected"
      : outcome.kind === "cancelled"
        ? "cancelled"
        : outcome.kind === "error"
          ? "error"
          : "completed";
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    outcome,
    result: outcome.content,
    isError: outcome.kind === "error",
    status,
  };
}

async function runWorkspaceMutation<T>(key: string, signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  throwIfAborted(signal);
  const previous = workspaceMutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current, () => current);
  workspaceMutationQueues.set(key, tail);
  await previous.catch(() => undefined);
  throwIfAborted(signal);
  try {
    return await operation();
  } finally {
    release();
    if (workspaceMutationQueues.get(key) === tail) {
      workspaceMutationQueues.delete(key);
    }
  }
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
