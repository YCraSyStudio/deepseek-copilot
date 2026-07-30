import type { ToolDefinition } from "@/adapters";

/** Tool danger level. */
export type DangerLevel = "safe" | "caution" | "dangerous" | "destructive";

/** Extended metadata for a registered tool. */
export interface ToolMetadata {
  dangerLevel: DangerLevel;
  warningMessage?: string;
  requiresConfirmation: boolean;
}

/** Registered tool definition, handler, and metadata. */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>, context?: ToolHandlerContext) => Promise<string>;
  metadata: ToolMetadata;
}

export interface ToolHandlerContext {
  signal?: AbortSignal;
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
  result: string;
  isError: boolean;
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
