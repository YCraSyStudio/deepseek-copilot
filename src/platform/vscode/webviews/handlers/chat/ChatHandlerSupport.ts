import * as vscode from "vscode";
import type {
  ChatMessage,
  PermissionMode,
  StoredToolCall,
  ToolDefinition,
  WorkspaceContextStatus,
} from "@/contracts";
import type { WorkspaceRunSnapshot } from "@/platform/vscode/workspace";
import { redactSensitiveText } from "@/shared/security/Redaction";
import { buildTerminalRuntimeNotice } from "./TerminalRuntimeNotice";
import { isCancellationError as isSharedCancellationError } from "@/shared/utils/Cancellation";

export interface ParsedSlashCommand {
  name: string;
  args: string[];
}

export function isCancellationError(err: unknown, signal?: AbortSignal): boolean {
  return isSharedCancellationError(err, signal);
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? redactSensitiveText(err) : "Unexpected error while connecting to the API";
}

export function appendToolAvailabilityContext(
  messages: ChatMessage[],
  permissionMode: PermissionMode,
  tools: ToolDefinition[],
  workspaceSnapshot?: WorkspaceRunSnapshot,
): void {
  const systemMessage = messages.find((message) => message.role === "system");
  if (!systemMessage) {
    return;
  }

  const availableToolNames = tools.map((tool) => tool.function.name);
  const delegatedTools = permissionMode === "auto-approve" || permissionMode === "full-access"
    ? tools.map((tool) => tool.function.name)
    : [];
  const capabilityNotice = permissionMode === "full-access"
    ? "The user enabled full computer access. Routine and elevated operations may run automatically anywhere; critical operations that could make the computer unusable or cause broad irreversible loss still require confirmation."
    : permissionMode === "auto-approve"
      ? "Routine operations are delegated inside and outside the workspace. Elevated or critical operations still require explicit confirmation."
      : "Every tool call requires confirmation. Use only the tools listed below and do not imply that unavailable capabilities can be used.";
  const delegationNotice = delegatedTools.length > 0
    ? `\n- Unattended tools: ${delegatedTools.join(", ")}. The user explicitly delegated these approvals. Each call executes immediately, so call them only when necessary, directly aligned with the request, and with the narrowest safe arguments.`
    : "";
  const terminalNotice = availableToolNames.includes("run_terminal_command")
    ? buildTerminalRuntimeNotice(workspaceSnapshot)
    : "";
  systemMessage.content = `${systemMessage.content ?? ""}\n\nRuntime permissions:\n- Permission mode: ${permissionMode}\n- Available tools: ${availableToolNames.length > 0 ? availableToolNames.join(", ") : "none"}${delegationNotice}\n- ${capabilityNotice}${terminalNotice}`;
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [rawName, ...args] = trimmed.slice(1).split(/\s+/).filter(Boolean);
  return { name: (rawName || "").toLowerCase(), args };
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "default" || value === "auto-approve" || value === "full-access";
}

export function normalizePermissionMode(value: string | undefined): string | undefined {
  if (value === "full") {
    return "full-access";
  }
  return value;
}

export function getWorkspaceStatusError(status: WorkspaceContextStatus): string {
  if (status.state === "changed") {
    return `Workspace "${status.binding.name}" changed. Confirm or reassign the workspace before continuing.`;
  }
  if (status.state === "empty") {
    return "Open a workspace before starting a generation.";
  }
  return `Workspace "${status.binding.name}" is disconnected. Open it or reassign this conversation.`;
}

export function upsertStoredToolCall(toolCalls: StoredToolCall[], value: StoredToolCall): void {
  const index = toolCalls.findIndex((toolCall) => toolCall.toolCallId === value.toolCallId);
  if (index >= 0) {
    toolCalls[index] = { ...toolCalls[index], ...value };
  } else {
    toolCalls.push(value);
  }
}

export function isStoredToolStatus(value: unknown): value is StoredToolCall["status"] {
  return value === "pending" ||
    value === "awaiting_confirmation" ||
    value === "running" ||
    value === "completed" ||
    value === "rejected" ||
    value === "cancelled" ||
    value === "error";
}

export function normalizeWorkspaceUri(workspaceUri: string): string {
  try {
    return vscode.Uri.parse(workspaceUri).toString(true);
  } catch {
    return workspaceUri;
  }
}
