import type { ToolCall } from "@/adapters";
import { ToolExecutor } from "@/core/tools/ToolExecutor";
import { getToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import type { ExecutionResult } from "@/core/tools/Types";
import type { HandleExecutionResultOptions, StoredExecution, ToolExecutionContext } from "./Types";

const DANGER_CANCELLED = "Tool call cancelled by user (dangerous operation)";
const EXTERNAL_ACCESS_CANCELLED = "Tool call cancelled because access outside the workspace was not approved";
const USER_REJECTED = "Tool call rejected by user";
const CYCLE_UNAVAILABLE = "Tool call cycle not available";
const TOOL_DISABLED = "Tool call rejected because the tool is disabled";
const UNTRUSTED_WORKSPACE = "Tool call rejected because the workspace is not trusted";
const MUTATING_TOOLS = new Set(["create_file", "edit_file", "apply_patch", "run_terminal_command"]);

export async function executeToolCall(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  recordInitialToolCall(toolCall, ctx);

  if (!ctx.isWorkspaceTrusted() && MUTATING_TOOLS.has(toolCall.function.name)) {
    postToolCallResult(ctx, createRejectedResult(toolCall, UNTRUSTED_WORKSPACE));
    return UNTRUSTED_WORKSPACE;
  }

  const mode = ctx.getToolMode(toolCall.function.name);
  if (mode === "disabled") {
    postToolCallResult(ctx, createRejectedResult(toolCall, TOOL_DISABLED));
    return TOOL_DISABLED;
  }

  if (ctx.fullAccessMode) {
    const result = await ctx.toolExecutor.executeForced(toolCall, { signal: ctx.signal });
    postToolCallResult(ctx, result);
    return result.result;
  }

  if (ctx.autoApproveMode || mode === "auto_approve") {
    const externalAccess = await getExternalAccessConfirmation(toolCall);
    if (externalAccess) {
      if (ctx.isDangerTrusted(toolCall, externalAccess)) {
        return executeForcedAfterTrust(toolCall, ctx, externalAccess);
      }
      updateStoredToolCall(ctx, toolCall.id, { status: "awaiting_confirmation" });
      const decision = await ctx.requestDangerConfirmation(toolCall, externalAccess, {
        announceStarted: true,
        round: ctx.getCurrentRound(),
      });
      if (!decision.confirmed) {
        postToolCallResult(ctx, createRejectedResult(toolCall, EXTERNAL_ACCESS_CANCELLED));
        return EXTERNAL_ACCESS_CANCELLED;
      }
      if (decision.trustForSession) {
        ctx.trustDangerForSession(toolCall, externalAccess);
      }
      updateStoredToolCall(ctx, toolCall.id, { status: "running" });
      return executeForcedAfterTrust(toolCall, ctx, externalAccess);
    }
  }

  if ((ctx.autoApproveMode || mode === "auto_approve") && toolCall.function.name !== "run_terminal_command") {
    const result = await ctx.toolExecutor.executeForced(toolCall, { signal: ctx.signal });
    postToolCallResult(ctx, result);
    return result.result;
  }

  if (ctx.autoApproveMode || mode === "auto_approve") {
    const result = await ctx.toolExecutor.execute(toolCall, { signal: ctx.signal });
    const confirmation = ToolExecutor.isConfirmationRequired(result.result);
    if (confirmation?.workspaceContained === true) {
      return executeForcedAfterTrust(toolCall, ctx, confirmation);
    }
    return handleExecutionResult({
      toolCall,
      result,
      ctx,
      announceStarted: true,
      round: ctx.getCurrentRound(),
    });
  }

  if (mode === "enabled") {
    return executeManualToolCall(toolCall, ctx);
  }

  const result = await ctx.toolExecutor.execute(toolCall, { signal: ctx.signal });
  return handleExecutionResult({
    toolCall,
    result,
    ctx,
    announceStarted: true,
    round: ctx.getCurrentRound(),
  });
}

async function getExternalAccessConfirmation(
  toolCall: ToolCall,
): Promise<import("@/core/tools/Types").ConfirmationRequiredResult | undefined> {
  const pathArgument = getPathArgument(toolCall);
  if (!pathArgument) {
    return undefined;
  }
  const workspace = getToolWorkspaceHost();
  if (!workspace.isPathInsideWorkspace || await workspace.isPathInsideWorkspace(pathArgument)) {
    return undefined;
  }
  return {
    requiresConfirmation: true,
    dangerLevel: "dangerous",
    warningMessage: "This operation accesses a path outside the active workspace.",
    filePath: pathArgument,
    reasonCode: "outside-workspace",
    workspaceContained: false,
  };
}

function getPathArgument(toolCall: ToolCall): string | undefined {
  const pathTools = new Set(["read_file", "list_directory", "create_file", "edit_file", "apply_patch"]);
  if (!pathTools.has(toolCall.function.name) && toolCall.function.name !== "run_terminal_command") {
    return undefined;
  }
  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    const value = toolCall.function.name === "run_terminal_command" ? args.cwd : args.path;
    return typeof value === "string" && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

function recordInitialToolCall(toolCall: ToolCall, ctx: ToolExecutionContext): void {
  const requiresConfirmation = !ctx.autoApproveMode && !ctx.fullAccessMode && ctx.getToolMode(toolCall.function.name) === "enabled";
  ctx.executedToolCalls.set(toolCall.id, {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    arguments: toolCall.function.arguments,
    round: ctx.getCurrentRound(),
    requiresConfirmation,
    status: requiresConfirmation ? "awaiting_confirmation" : "running",
  });
}

async function executeManualToolCall(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  const individualPromise = ctx.getPendingCycle()?.individualPromises.get(toolCall.id);
  if (!individualPromise) {
    const result = createErrorResult(toolCall, CYCLE_UNAVAILABLE);
    postToolCallResult(ctx, result);
    return CYCLE_UNAVAILABLE;
  }

  const action = await individualPromise;
  if (action === "reject") {
    postToolCallResult(ctx, createRejectedResult(toolCall, USER_REJECTED));
    return USER_REJECTED;
  }

  const result = await ctx.toolExecutor.execute(toolCall, { signal: ctx.signal });
  return handleExecutionResult({
    toolCall,
    result,
    ctx,
    round: ctx.getCurrentRound(),
  });
}

async function handleExecutionResult(options: HandleExecutionResultOptions): Promise<string> {
  const { toolCall, result, ctx, announceStarted, round } = options;
  const dangerInfo = ToolExecutor.isConfirmationRequired(result.result);
  updateStoredToolCall(ctx, toolCall.id, {
    result: result.result,
    isError: result.isError,
    dangerLevel: dangerInfo?.dangerLevel,
  });

  if (!dangerInfo) {
    postToolCallResult(ctx, result);
    return result.result;
  }

  if (ctx.isDangerTrusted(toolCall, dangerInfo)) {
    return executeForcedAfterTrust(toolCall, ctx, dangerInfo);
  }

  updateStoredToolCall(ctx, toolCall.id, { status: "awaiting_confirmation" });
  const decision = await ctx.requestDangerConfirmation(toolCall, dangerInfo, { announceStarted, round });
  if (!decision.confirmed) {
    clearFileDiffPreview();
    postToolCallResult(ctx, createRejectedResult(toolCall, DANGER_CANCELLED));
    return DANGER_CANCELLED;
  }

  if (decision.trustForSession) {
    ctx.trustDangerForSession(toolCall, dangerInfo);
  }

  updateStoredToolCall(ctx, toolCall.id, { status: "running" });
  return executeForcedAfterTrust(toolCall, ctx, dangerInfo);
}

function clearFileDiffPreview(): void {
  getToolWorkspaceHost().clearFileDiffPreview?.();
}

async function executeForcedAfterTrust(toolCall: ToolCall, ctx: ToolExecutionContext, confirmation?: import("@/core/tools/Types").ConfirmationRequiredResult): Promise<string> {
  const forcedToolCall = confirmation?.beforeHash ? withExpectedBeforeHash(toolCall, confirmation.beforeHash) : toolCall;
  const forcedResult = await ctx.toolExecutor.executeForced(forcedToolCall, { signal: ctx.signal });
  postToolCallResult(ctx, forcedResult);
  updateStoredToolCall(ctx, toolCall.id, { dangerConfirmed: true });
  return forcedResult.result;
}

function withExpectedBeforeHash(toolCall: ToolCall, beforeHash: string): ToolCall {
  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    return { ...toolCall, function: { ...toolCall.function, arguments: JSON.stringify({ ...args, expectedBeforeHash: beforeHash }) } };
  } catch { return toolCall; }
}

function createRejectedResult(toolCall: ToolCall, result: string): ExecutionResult & { rejected: true; status: "rejected" } {
  return { toolCallId: toolCall.id, toolName: toolCall.function.name, result, isError: false, rejected: true, status: "rejected" };
}

function createErrorResult(toolCall: ToolCall, result: string): ExecutionResult & { status: "error" } {
  return { toolCallId: toolCall.id, toolName: toolCall.function.name, result, isError: true, status: "error" };
}

function postToolCallResult(
  ctx: ToolExecutionContext,
  result: ExecutionResult & { rejected?: boolean; status?: StoredExecution["status"] },
): void {
  const status = result.status ?? (result.rejected ? "rejected" : result.isError ? "error" : "completed");
  ctx.webviewView.webview.postMessage({
    type: "toolCallResult",
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    result: result.result,
    isError: result.isError,
    rejected: result.rejected,
    status,
  });
  updateStoredToolCall(ctx, result.toolCallId, {
    result: result.result,
    isError: result.isError,
    rejected: result.rejected,
    requiresConfirmation: false,
    status,
  });
}

function updateStoredToolCall(ctx: ToolExecutionContext, toolCallId: string, patch: Partial<StoredExecution>): void {
  const existing = ctx.executedToolCalls.get(toolCallId);
  if (existing) {
    Object.assign(existing, patch);
  }
}
