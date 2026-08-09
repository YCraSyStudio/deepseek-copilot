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
const EXTERNAL_ACCESS_CANCELLED = "Tool call cancelled because access outside the workspace was not approved";
const USER_REJECTED = "Tool call rejected by user";
const CYCLE_UNAVAILABLE = "Tool call cycle not available";
const TOOL_DISABLED = "Tool call rejected because the tool is disabled";
const UNTRUSTED_WORKSPACE = "Tool call rejected because the workspace is not trusted";
const MUTATING_TOOLS = new Set(["create_file", "edit_file", "apply_patch", "run_terminal_command"]);
const NON_DELEGABLE_REASON_CODES = new Set([
  "outside-workspace",
  "destructive-delete",
  "destructive-git",
  "destructive-disk",
  "download-execute",
  "publish",
  "deployment",
  "remote-mutation",
  "elevation",
  "process-termination",
]);

export async function executeToolCall(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  recordInitialToolCall(toolCall, ctx);
  const decision = await createToolExecutionPipeline().execute({
    toolCall,
    ctx,
    mode: ctx.getToolMode(toolCall.function.name),
  });
  if (decision.kind === "resolved") {return decision.result;}
  throw new Error("Tool execution pipeline completed without a result");
}

interface ToolPipelineContext {
  toolCall: ToolCall;
  ctx: ToolExecutionContext;
  mode: ReturnType<ToolExecutionContext["getToolMode"]>;
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
        if (context.resultText) {return { kind: "continue", context };}
        if (context.mode === "disabled") {
          postToolCallResult(context.ctx, createRejectedResult(context.toolCall, TOOL_DISABLED));
          context.resultText = TOOL_DISABLED;
          return { kind: "continue", context };
        }
        if (context.mode === "enabled" && isApprovalOwnedByVsCode(context.toolCall, context.ctx)) {
          const result = await context.ctx.toolExecutor.execute(context.toolCall, handlerContext(context.ctx));
          postToolCallResult(context.ctx, result);
          context.resultText = serializeExecutionResult(result);
        }
        return { kind: "continue", context };
      },
    },
    {
      name: "web_contamination",
      async handle(context) {
        if (context.resultText || !isAutomaticExecution(context) || !context.ctx.isWebTainted?.() || !MUTATING_TOOLS.has(context.toolCall.function.name)) {
          return { kind: "continue", context };
        }
        context.resultText = await executeWebTaintedMutation(context.toolCall, context.ctx);
        return { kind: "continue", context };
      },
    },
    {
      name: "local_security",
      async handle(context) {
        if (context.resultText) {return { kind: "continue", context };}
        if (context.ctx.fullAccessMode) {
          const result = await context.ctx.toolExecutor.executeForced(context.toolCall, handlerContext(context.ctx));
          postToolCallResult(context.ctx, result);
          context.resultText = serializeExecutionResult(result);
          return { kind: "continue", context };
        }
        if (!isAutomaticExecution(context)) {return { kind: "continue", context };}
        const externalAccess = await getExternalAccessConfirmation(context.toolCall);
        if (externalAccess) {
          if (context.ctx.isDangerTrusted(context.toolCall, externalAccess)) {
            context.resultText = await executeForcedAfterTrust(context.toolCall, context.ctx, externalAccess);
            return { kind: "continue", context };
          }
          updateStoredToolCall(context.ctx, context.toolCall.id, { status: "awaiting_confirmation" });
          const decision = await context.ctx.requestDangerConfirmation(context.toolCall, externalAccess, {
            announceStarted: true,
            round: context.ctx.getCurrentRound(),
          });
          if (!decision.confirmed) {
            postToolCallResult(context.ctx, createRejectedResult(context.toolCall, EXTERNAL_ACCESS_CANCELLED));
            context.resultText = EXTERNAL_ACCESS_CANCELLED;
            return { kind: "continue", context };
          }
          if (decision.trustForSession) {context.ctx.trustDangerForSession(context.toolCall, externalAccess);}
          updateStoredToolCall(context.ctx, context.toolCall.id, { status: "running" });
          context.resultText = await executeForcedAfterTrust(context.toolCall, context.ctx, externalAccess);
          return { kind: "continue", context };
        }
        if (context.toolCall.function.name !== "run_terminal_command") {
          const result = await context.ctx.toolExecutor.executeForced(context.toolCall, handlerContext(context.ctx));
          postToolCallResult(context.ctx, result);
          context.resultText = serializeExecutionResult(result);
          return { kind: "continue", context };
        }
        context.executionResult = await context.ctx.toolExecutor.execute(context.toolCall, handlerContext(context.ctx));
        context.confirmation = ToolExecutor.isConfirmationRequired(context.executionResult.result) ?? undefined;
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
        if (context.ctx.isDangerTrusted(context.toolCall, confirmation)) {
          context.resultText = await executeForcedAfterTrust(context.toolCall, context.ctx, confirmation);
          return { kind: "continue", context };
        }
        const guidance = getLocalRevisionGuidance(confirmation);
        if (guidance) {
          context.resultText = rejectCommandForRevision(context.toolCall, guidance, context.ctx);
          return { kind: "continue", context };
        }
        if (!isDeepSeekReviewEligible(confirmation)) {return { kind: "continue", context };}
        const review = await reviewDangerousCommandFailClosed(context.toolCall, confirmation, context.ctx);
        if (review.decision === "approve" && isAutomaticConfidence(review.confidence) && confirmation.workspaceContained === true) {
          context.resultText = await executeForcedAfterTrust(context.toolCall, context.ctx, confirmation);
          return { kind: "continue", context };
        }
        if (review.decision === "revise" && isAutomaticConfidence(review.confidence)) {
          context.resultText = rejectCommandForRevision(context.toolCall, review.reason, context.ctx);
          return { kind: "continue", context };
        }
        const reason = review.decision === "approve" && isAutomaticConfidence(review.confidence)
          ? `${review.reason} The local analyzer did not prove that every filesystem effect stays inside the active workspace.`
          : review.reason;
        context.dangerOverride = {
          ...confirmation,
          warningMessage: `${confirmation.warningMessage} DeepSeek review: ${reason}`,
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
        } else if (context.mode === "enabled") {
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
  return context.ctx.fullAccessMode || context.ctx.autoApproveMode || context.mode === "auto_approve";
}

export function recordSyntheticToolError(toolCall: ToolCall, ctx: ToolExecutionContext, result: string): void {
  recordInitialToolCall(toolCall, ctx);
  postToolCallResult(ctx, createErrorResult(toolCall, result));
}

async function getExternalAccessConfirmation(
  toolCall: ToolCall,
): Promise<import("@/application/tools/Types").ConfirmationRequiredResult | undefined> {
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
  const requiresConfirmation = !ctx.autoApproveMode && !ctx.fullAccessMode &&
    ctx.getToolMode(toolCall.function.name) === "enabled" &&
    !isApprovalOwnedByVsCode(toolCall, ctx);
  ctx.executedToolCalls.set(toolCall.id, {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    arguments: toolCall.function.arguments,
    round: ctx.getCurrentRound(),
    requiresConfirmation,
    status: requiresConfirmation ? "awaiting_confirmation" : "running",
  });
}

function isApprovalOwnedByVsCode(toolCall: ToolCall, ctx: ToolExecutionContext): boolean {
  return typeof ctx.toolExecutor.getMetadata === "function" &&
    ctx.toolExecutor.getMetadata(toolCall.function.name)?.approvalOwner === "vscode";
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
      confidence: "very_low",
      reason: "DeepSeek safety review failed, so manual confirmation is required.",
    };
  }
}

function isDeepSeekReviewEligible(confirmation: import("@/application/tools/Types").ConfirmationRequiredResult): boolean {
  if (confirmation.dangerLevel === "destructive") {
    return false;
  }
  return !confirmation.reasonCode || !NON_DELEGABLE_REASON_CODES.has(confirmation.reasonCode);
}

function getLocalRevisionGuidance(
  confirmation: import("@/application/tools/Types").ConfirmationRequiredResult,
): string | undefined {
  const command = confirmation.command ?? "";
  const startsDetachedProcess =
    /\bstart\s+\/B\b/i.test(command) ||
    /\bStart-Process\b(?![^\r\n;]*-Wait\b)/i.test(command);
  const startsDevelopmentServer =
    /\bdotnet\s+run\b/i.test(command) ||
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start)\b/i.test(command) ||
    /\bastro\s+dev\b/i.test(command);
  if (startsDetachedProcess && startsDevelopmentServer) {
    return [
      "Do not leave a detached development server running from a finite terminal tool call.",
      "A successful normal build is sufficient unless the user explicitly requested a runtime or HTTP check.",
      "If runtime verification is required, re-plan with a process-scoped harness that waits for readiness and guarantees cleanup of only the child process it started.",
    ].join(" ");
  }
  if (
    confirmation.reasonCode === "process-termination" &&
    /\bstart\s+\/B\b/i.test(command) &&
    /\btaskkill\b[^\r\n]*\/IM\s+(?:dotnet|node)(?:\.exe)?\b/i.test(command)
  ) {
    return [
      "Do not start a detached development server and then terminate every matching runtime process.",
      "A successful backend and frontend build is sufficient unless the user explicitly requested a runtime or HTTP check.",
      "If runtime verification is required, re-plan with a process-scoped harness that records and terminates only the child process it started.",
    ].join(" ");
  }
  return undefined;
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
  getToolWorkspaceHost().clearFileDiffPreview?.();
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
  };
}

async function executeWebTaintedMutation(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  const external = await getExternalAccessConfirmation(toolCall);
  if (external) {
    return handleExecutionResult({
      toolCall,
      result: createConfirmationResult(toolCall, external),
      ctx,
      announceStarted: true,
      round: ctx.getCurrentRound(),
    }, external);
  }
  if (toolCall.function.name === "run_terminal_command" && hasNetworkOrRemoteEffect(toolCall.function.arguments)) {
    const confirmation = {
      requiresConfirmation: true as const,
      dangerLevel: "dangerous" as const,
      warningMessage: "Web-tainted generations cannot auto-approve commands with network, credential, publication, or remote effects.",
      reasonCode: "web-tainted-external-effect",
      workspaceContained: false,
    };
    return handleExecutionResult({ toolCall, result: createConfirmationResult(toolCall, confirmation), ctx, announceStarted: true, round: ctx.getCurrentRound() }, confirmation);
  }
  if (toolCall.function.name === "create_file") {
    const prepared = await prepareWebTaintedCreate(toolCall);
    if (prepared) {return reviewAnalyzedWebMutation(toolCall, createConfirmationResult(toolCall, prepared), prepared, ctx);}
  }
  return executeAnalyzedWebMutation(toolCall, ctx);
}

async function executeAnalyzedWebMutation(toolCall: ToolCall, ctx: ToolExecutionContext): Promise<string> {
  const analyzed = await ctx.toolExecutor.execute(toolCall, handlerContext(ctx));
  const confirmation = ToolExecutor.isConfirmationRequired(analyzed.result);
  if (!confirmation) {postToolCallResult(ctx, analyzed); return analyzed.result;}
  const scopedConfirmation = await addProvenFileScope(toolCall, confirmation);
  return reviewAnalyzedWebMutation(toolCall, analyzed, scopedConfirmation, ctx);
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

async function reviewAnalyzedWebMutation(
  toolCall: ToolCall,
  analyzed: ExecutionResult,
  confirmation: import("@/application/tools/Types").ConfirmationRequiredResult,
  ctx: ToolExecutionContext,
): Promise<string> {
  if (!isDeepSeekReviewEligible(confirmation) || confirmation.workspaceContained !== true) {
    return handleExecutionResult({ toolCall, result: analyzed, ctx, announceStarted: true, round: ctx.getCurrentRound() });
  }
  const review = await reviewDangerousCommandFailClosed(toolCall, confirmation, ctx);
  if (review.decision === "approve" && isAutomaticConfidence(review.confidence)) {
    return executeForcedAfterTrust(toolCall, ctx, confirmation);
  }
  if (review.decision === "revise" && isAutomaticConfidence(review.confidence)) {
    clearFileDiffPreview();
    return rejectCommandForRevision(toolCall, review.reason, ctx);
  }
  return handleExecutionResult({ toolCall, result: analyzed, ctx, announceStarted: true, round: ctx.getCurrentRound() }, {
    ...confirmation,
    warningMessage: `${confirmation.warningMessage} Automatic review: ${review.reason}`,
  });
}

async function prepareWebTaintedCreate(
  toolCall: ToolCall,
): Promise<import("@/application/tools/Types").ConfirmationRequiredResult | undefined> {
  const filePath = getPathArgument(toolCall);
  const workspace = getToolWorkspaceHost();
  if (!filePath || !workspace.isPathInsideWorkspace || !await workspace.isPathInsideWorkspace(filePath)) {
    return {
      requiresConfirmation: true,
      dangerLevel: "dangerous",
      warningMessage: "The workspace boundary for this web-tainted file creation could not be proven.",
      filePath,
      reasonCode: "outside-workspace",
      workspaceContained: false,
    };
  }
  try {
    await workspace.stat(filePath);
    return undefined;
  } catch {
    let size = 0;
    try {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      size = Buffer.byteLength(typeof args.content === "string" ? args.content : "", "utf8");
    } catch { /* Tool validation will report malformed arguments before forced execution. */ }
    return {
      requiresConfirmation: true,
      dangerLevel: "caution",
      warningMessage: `Create a new workspace file (${size} UTF-8 bytes) after web access. File content is omitted from review.`,
      filePath,
      beforeHash: "missing",
      reasonCode: "web-tainted-workspace-mutation",
      workspaceRoot: workspace.getRootPath?.(),
      workspaceContained: true,
    };
  }
}

function hasNetworkOrRemoteEffect(argumentsJson: string): boolean {
  return /\b(?:curl|wget|invoke-webrequest|invoke-restmethod|irm|iwr|ssh|scp|sftp|ftp|telnet|nc|ncat|netcat|ping|nslookup|resolve-dnsname|test-netconnection|certutil\s+-urlcache|bitsadmin)\b/i.test(argumentsJson) ||
    /\bgit\b[^\r\n]{0,200}\b(?:push|pull|fetch|clone|ls-remote|submodule)\b/i.test(argumentsJson) ||
    /\b(?:gh|az|aws|gcloud|kubectl)\s+/i.test(argumentsJson) ||
    /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|update|upgrade|audit|publish|login|logout|whoami|view|info)\b/i.test(argumentsJson) ||
    /\b(?:pip|pip3|uv)\s+(?:install|download|sync)\b|\bcargo\s+(?:install|search|publish)\b|\bgo\s+(?:get|install)\b/i.test(argumentsJson) ||
    /\bdotnet\s+(?:restore|tool\s+install|add\s+\S+\s+package)\b|\b(?:apt|apt-get|dnf|yum|pacman|winget|choco|brew)\s+(?:install|update|upgrade)\b/i.test(argumentsJson) ||
    /\bdocker\s+(?:push|pull|login)|\bterraform\s+(?:apply|destroy|init)\b/i.test(argumentsJson) ||
    /(?:https?:\/\/|\\\\[^\\\s]+\\|token|password|secret|api[_-]?key|credential)/i.test(argumentsJson);
}

function createConfirmationResult(toolCall: ToolCall, confirmation: import("@/application/tools/Types").ConfirmationRequiredResult): ExecutionResult {
  return createExecutionResult(toolCall, {
    kind: "confirmation_required",
    content: JSON.stringify(confirmation),
    dangerLevel: confirmation.dangerLevel,
  });
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
