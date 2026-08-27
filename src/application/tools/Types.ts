import type { ToolDefinition } from "@/contracts";
import type { ToolExecutionOutcome } from "@/domain/tools/ToolExecutionOutcome";

/** Tool danger level. */
export type DangerLevel = "safe" | "caution" | "dangerous" | "destructive";

/**
 * Operational effect used by execution policy.
 *
 * Keeping this explicit avoids duplicating tool-name lists in the executor and
 * safety pipeline. New workspace tools default conservatively unless they are
 * explicitly marked read-only.
 */
export type ToolEffect = "read-only" | "workspace-mutation" | "external-effect";

/** Extended metadata for a registered tool. */
export interface ToolMetadata {
  dangerLevel: DangerLevel;
  warningMessage?: string;
  requiresConfirmation: boolean;
  /** Whether the tool needs a workspace binding or can run globally. */
  scope?: "workspace" | "global";
  /** What kind of side effect the tool may produce. */
  effect?: ToolEffect;
}

/** Registered tool definition, handler, and metadata. */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>, context?: ToolHandlerContext) => Promise<string>;
  forcedHandler?: (args: Record<string, unknown>, context?: ToolHandlerContext) => Promise<string>;
  metadata: ToolMetadata;
}

export interface ToolHandlerContext {
  signal?: AbortSignal;
  generationId?: string;
  trustedUserRequest?: string;
  availableToolNames?: readonly string[];
  authorizedUserUrls?: readonly string[];
  webTainted?: boolean;
  analyzeImages?: (question: string, imageIds: string[], signal?: AbortSignal) => Promise<string>;
}

/** Tool-call validation result. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Tool-call execution result. */
export interface ExecutionResult {
  toolCallId: string;
  toolName: string;
  outcome: ToolExecutionOutcome;
  status: "completed" | "error" | "confirmation_required" | "rejected" | "cancelled";
}

/** Special handler response requiring user confirmation. */
export interface ConfirmationRequiredResult {
  requiresConfirmation: true;
  dangerLevel: DangerLevel;
  warningMessage: string;
  command?: string;
  filePath?: string;
  cwd?: string;
  workspaceRoot?: string;
  shell?: string;
  beforeHash?: string;
  reasonCode?: string;
  normalizedCommand?: string;
  workspaceContained?: boolean;
}
