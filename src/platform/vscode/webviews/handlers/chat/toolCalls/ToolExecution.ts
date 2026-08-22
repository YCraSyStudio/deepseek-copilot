import type { ToolCall } from "@/contracts";
import { createExecutionResult, ToolExecutor } from "@/application/tools/ToolExecutor";
import { getToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import { isAutomaticConfidence } from "@/infrastructure/deepseek/security/commandReview";
import type { ExecutionResult } from "@/application/tools/Types";
import type { ToolHandlerContext } from "@/application/tools/Types";
import type { HandleExecutionResultOptions, StoredExecution, ToolExecutionContext } from "./Types";
import { serializeToolExecutionOutcome } from "@/domain/tools/ToolExecutionOutcome";
import { ToolExecutionPipeline } from "@/application/tools/ToolExecutionPipeline";

const DANGER_CANCELLED = "Tool call cancelled by user (dangerous operation)";
const USER_REJECTED = "Tool call rejected by user";
const CYCLE_UNAVAILABLE = "Tool call cycle not available";
const UNTRUSTED_WORKSPACE = "Tool call rejected because the workspace is not trusted";
const MUTATING_TOOLS = new Set(["create_file", "edit_file", "apply_patch", "run_terminal_command"]);

export async function executeToolCall(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  recordInitialToolCall(toolCall, ctx);
  const decision = await createToolExecutionPipeline().execute({
    toolCall,
    ctx,
  });
  if (decision.kind === "resolved") {return decision.result;}
  throw new Error("Tool execution pipeline completed without a result");
}

interface ToolPipelineContext {
  toolCall: ToolCall;
  ctx: ToolExecutionContext;
  resultText?: string;
  executionResult?: ExecutionResult;
  confirmation?: import("@/application/tools/Types").ConfirmationRequiredResult;
  dangerOverride?: import("@/application/tools/Types").ConfirmationRequiredResult;
}

function createToolExecutionPipeline(): ToolExecutionPipeline<ToolPipelineContext, string> {
  return new ToolExecutionPipeline([
    {
      name: "argument_validation",
      async handle(context) {
        // Detailed schema validation remains owned by ToolExecutor so all callers share it.
        return { kind: "continue", context };
      },
    },
    {
      name: "workspace_trust",
      async handle(context) {
        if (!context.ctx.isWorkspaceTrusted() && MUTATING_TOOLS.has(context.toolCall.function.name)) {
          postToolCallResult(context.ctx, createRejectedResult(context.toolCall, UNTRUSTED_WORKSPACE));
          context.resultText = UNTRUSTED_WORKSPACE;
        }
        return { kind: "continue", context };
      },
    },
    {
      name: "permission_policy",
      async handle(context) {
        return { kind: "continue", context };
      },
    },
    {
      name: "prepare_remote_review",
      async handle(context) {
        if (context.resultText) {return { kind: "continue", context };}
        if (!isAutomaticExecution(context)) {return { kind: "continue", context };}
        if (!MUTATING_TOOLS.has(context.toolCall.function.name)) {
          const result = await context.ctx.toolExecutor.executeForced(context.toolCall, handlerContext(context.ctx));
          postToolCallResult(context.ctx, result);
          context.resultText = serializeExecutionResult(result);
          return { kind: "continue", context };
        }
        context.executionResult = await context.ctx.toolExecutor.execute(context.toolCall, handlerContext(context.ctx));
        const confirmation = ToolExecutor.isConfirmationRequired(context.executionResult.result) ?? undefined;
        context.confirmation = confirmation ? await addProvenFileScope(context.toolCall, confirmation) : undefined;
        if (!context.confirmation) {
          context.resultText = await handleExecutionResult({
            toolCall: context.toolCall,
            result: context.executionResult,
            ctx: context.ctx,
            announceStarted: true,
            round: context.ctx.getCurrentRound(),
          });
        }
        return { kind: "continue", context };
      },
    },
    {
      name: "remote_review",
      async handle(context) {
        const confirmation = context.confirmation;
        if (context.resultText || !context.executionResult || !confirmation) {return { kind: "continue", context };}
        const review = await reviewDangerousCommandFailClosed(context.toolCall, confirmation, context.ctx);
        const risk = review.risk;
        const canRunAutomatically = context.ctx.fullAccessMode
          ? risk !== "critical"
          : risk === "routine";
        if (review.decision === "approve" && isAutomaticConfidence(review.confidence) && canRunAutomatically) {
          context.resultText = await executeForcedAfterTrust(context.toolCall, context.ctx, confirmation);
          return { kind: "continue", context };
        }
        if (review.decision === "revise" && isAutomaticConfidence(review.confidence)) {
          context.resultText = rejectCommandForRevision(context.toolCall, review.reason, context.ctx);
          return { kind: "continue", context };
        }
        context.dangerOverride = {
          ...confirmation,
          dangerLevel: risk === "critical" ? "destructive" : risk === "elevated" ? "dangerous" : "caution",
          warningMessage: `${confirmation.warningMessage} DeepSeek classified this action as ${risk}: ${review.reason}`,
        };
        return { kind: "continue", context };
      },
    },
    {
      name: "user_confirmation",
      async handle(context) {
        if (context.resultText) {return { kind: "continue", context };}
        if (context.executionResult && context.confirmation) {
          context.resultText = await handleExecutionResult({
            toolCall: context.toolCall,
            result: context.executionResult,
            ctx: context.ctx,
            announceStarted: true,
            round: context.ctx.getCurrentRound(),
          }, context.dangerOverride);
        } else if (!isAutomaticExecution(context)) {
          context.resultText = await executeManualToolCall(context.toolCall, context.ctx);
        }
        return { kind: "continue", context };
      },
    },
    {
      name: "execution",
      async handle(context) {
        if (context.resultText) {return { kind: "continue", context };}
        const result = await context.ctx.toolExecutor.execute(context.toolCall, handlerContext(context.ctx));
        context.resultText = await handleExecutionResult({
          toolCall: context.toolCall,
          result,
          ctx: context.ctx,
          announceStarted: true,
          round: context.ctx.getCurrentRound(),
        });
        return { kind: "continue", context };
      },
    },
    {
      name: "record_and_publish",
      async handle(context) {
        return context.resultText
          ? { kind: "resolved", result: context.resultText }
          : { kind: "resolved", result: "Tool execution produced no result" };
      },
    },
  ]);
}

function isAutomaticExecution(context: ToolPipelineContext): boolean {
  return context.ctx.fullAccessMode || context.ctx.autoApproveMode;
}

export function recordSyntheticToolError(toolCall: ToolCall, ctx: ToolExecutionContext, result: string): void {
  recordInitialToolCall(toolCall, ctx);
  postToolCallResult(ctx, createErrorResult(toolCall, result));
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
  const requiresConfirmation = !ctx.autoApproveMode && !ctx.fullAccessMode;
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

  const result = await ctx.toolExecutor.execute(toolCall, handlerContext(ctx));
  return handleExecutionResult({
    toolCall,
    result,
    ctx,
    round: ctx.getCurrentRound(),
  });
}

async function handleExecutionResult(
  options: HandleExecutionResultOptions,
  dangerOverride?: import("@/application/tools/Types").ConfirmationRequiredResult,
): Promise<string> {
  const { toolCall, result, ctx, announceStarted, round } = options;
  const dangerInfo = dangerOverride ?? ToolExecutor.isConfirmationRequired(result.result);
  updateStoredToolCall(ctx, toolCall.id, {
    result: result.result,
    isError: result.isError,
    dangerLevel: dangerInfo?.dangerLevel,
  });

  if (!dangerInfo) {
    postToolCallResult(ctx, result);
    return serializeExecutionResult(result);
  }

  updateStoredToolCall(ctx, toolCall.id, { status: "awaiting_confirmation" });
  const decision = await ctx.requestDangerConfirmation(toolCall, dangerInfo, { announceStarted, round });
  if (!decision.confirmed) {
    clearFileDiffPreview();
    postToolCallResult(ctx, createRejectedResult(toolCall, DANGER_CANCELLED));
    return DANGER_CANCELLED;
  }

  updateStoredToolCall(ctx, toolCall.id, { status: "running" });
  return executeForcedAfterTrust(toolCall, ctx, dangerInfo);
}

async function reviewDangerousCommandFailClosed(
  toolCall: ToolCall,
  confirmation: import("@/application/tools/Types").ConfirmationRequiredResult,
  ctx: ToolExecutionContext,
): ReturnType<ToolExecutionContext["reviewDangerousCommand"]> {
  try {
    return await ctx.reviewDangerousCommand(toolCall, confirmation);
  } catch {
    return {
      decision: "manual_confirmation",
      risk: "critical",
      confidence: "very_low",
      reason: "DeepSeek safety review failed, so manual confirmation is required.",
    };
  }
}

function rejectCommandForRevision(toolCall: ToolCall, guidance: string, ctx: ToolExecutionContext): string {
  const result = [
    "Security reviewer rejected this command. Do not repeat it or bypass the safety controls.",
    "Re-plan the operation and continue with a safer tool or a more narrowly scoped command.",
    `Reviewer guidance: ${guidance}`,
  ].join(" ");
  postToolCallResult(ctx, createRejectedResult(toolCall, result));
  return result;
}

function clearFileDiffPreview(): void {
  try {
    getToolWorkspaceHost().clearFileDiffPreview?.();
  } catch {
    // A preview host is optional for non-file confirmations and isolated tests.
  }
}

async function executeForcedAfterTrust(toolCall: ToolCall, ctx: ToolExecutionContext, confirmation?: import("@/application/tools/Types").ConfirmationRequiredResult): Promise<string> {
  const forcedToolCall = confirmation?.beforeHash ? withExpectedBeforeHash(toolCall, confirmation.beforeHash) : toolCall;
  const forcedResult = await ctx.toolExecutor.executeForced(forcedToolCall, handlerContext(ctx));
  postToolCallResult(ctx, forcedResult);
  updateStoredToolCall(ctx, toolCall.id, { dangerConfirmed: true });
  return serializeExecutionResult(forcedResult);
}

function withExpectedBeforeHash(toolCall: ToolCall, beforeHash: string): ToolCall {
  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    return { ...toolCall, function: { ...toolCall.function, arguments: JSON.stringify({ ...args, expectedBeforeHash: beforeHash }) } };
  } catch { return toolCall; }
}

function createRejectedResult(toolCall: ToolCall, result: string): ExecutionResult & { rejected: true; status: "rejected" } {
  return { ...createExecutionResult(toolCall, { kind: "rejected", content: result }), rejected: true, status: "rejected" };
}

function createErrorResult(toolCall: ToolCall, result: string): ExecutionResult & { status: "error" } {
  return { ...createExecutionResult(toolCall, { kind: "error", content: result }), status: "error" };
}

function postToolCallResult(
  ctx: ToolExecutionContext,
  result: ExecutionResult & { rejected?: boolean },
): void {
  if (!result.isError && (result.toolName === "search_web" || result.toolName === "read_web")) {
    ctx.markWebTainted?.();
  }
  const status: StoredExecution["status"] = result.status === "confirmation_required"
    ? "awaiting_confirmation"
    : result.status;
  void ctx.eventSink.publish({
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

function handlerContext(ctx: ToolExecutionContext): ToolHandlerContext {
  return {
    signal: ctx.signal,
    generationId: ctx.generationId,
    trustedUserRequest: ctx.trustedUserRequest,
    availableToolNames: ctx.availableToolNames,
    authorizedUserUrls: ctx.authorizedUserUrls,
    webTainted: ctx.isWebTainted?.(),
    analyzeImages: ctx.analyzeImages,
  };
}

async function addProvenFileScope(
  toolCall: ToolCall,
  confirmation: import("@/application/tools/Types").ConfirmationRequiredResult,
): Promise<import("@/application/tools/Types").ConfirmationRequiredResult> {
  if (!["create_file", "edit_file", "apply_patch"].includes(toolCall.function.name)) {return confirmation;}
  const filePath = confirmation.filePath ?? getPathArgument(toolCall);
  const workspace = getToolWorkspaceHost();
  const contained = Boolean(filePath && workspace.isPathInsideWorkspace && await workspace.isPathInsideWorkspace(filePath));
  return {
    ...confirmation,
    filePath,
    workspaceRoot: confirmation.workspaceRoot ?? workspace.getRootPath?.(),
    workspaceContained: contained,
    ...(contained ? {} : { reasonCode: "outside-workspace" }),
  };
}

function serializeExecutionResult(result: ExecutionResult): string {
  const outcome = (result as Partial<ExecutionResult>).outcome;
  return outcome ? serializeToolExecutionOutcome(outcome) : result.result;
}

function updateStoredToolCall(ctx: ToolExecutionContext, toolCallId: string, patch: Partial<StoredExecution>): void {
  const existing = ctx.executedToolCalls.get(toolCallId);
  if (existing) {
    Object.assign(existing, patch);
  }
}
