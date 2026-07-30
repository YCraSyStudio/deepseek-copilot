import type { ToolCallState } from "@webview/views/chatView/ChatViewTypes";
import { parseStructuredToolResult } from "@webview/views/chatView/utils/FileType";

const EDITOR_FILE_TOOLS = new Set([
  "read_file",
  "create_file",
  "edit_file",
  "apply_patch",
]);
const FILE_EDIT_TOOLS = new Set(["create_file", "edit_file", "apply_patch"]);
const MAX_CHANGE_DIFF_TEXT = 2 * 1024 * 1024;

export interface ToolCallFileChange {
  path: string;
  diff: string;
}

export function isEditorFileTool(toolName: string): boolean {
  return EDITOR_FILE_TOOLS.has(toolName);
}

export function getToolCallFilePath(
  toolCall: Pick<ToolCallState, "toolName" | "arguments">,
): string | undefined {
  if (!isEditorFileTool(toolCall.toolName)) {
    return undefined;
  }
  try {
    const args = JSON.parse(toolCall.arguments) as unknown;
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return undefined;
    }
    const filePath = (args as { path?: unknown }).path;
    return typeof filePath === "string" && filePath.trim()
      ? filePath
      : undefined;
  } catch {
    return undefined;
  }
}

export function hidesSuccessfulFileResult(toolCall: Pick<ToolCallState, "toolName" | "status">): boolean {
  return toolCall.status === "completed" && isEditorFileTool(toolCall.toolName);
}

export function getToolCallFileChange(
  toolCall: Pick<ToolCallState, "toolName" | "status" | "result">,
): ToolCallFileChange | undefined {
  if (
    toolCall.status !== "completed" ||
    !FILE_EDIT_TOOLS.has(toolCall.toolName) ||
    !toolCall.result
  ) {
    return undefined;
  }

  const result = parseStructuredToolResult(toolCall.result);
  if (
    !result ||
    (result.type !== "fileWrite" && result.type !== "fileEdit" && result.type !== "filePatch") ||
    result.diffTruncated === true ||
    typeof result.path !== "string" ||
    !result.path.trim() ||
    typeof result.diff !== "string" ||
    result.diff.length > MAX_CHANGE_DIFF_TEXT ||
    !/^@@ /m.test(result.diff)
  ) {
    return undefined;
  }

  const expectedType =
    toolCall.toolName === "create_file"
      ? "fileWrite"
      : toolCall.toolName === "edit_file"
        ? "fileEdit"
        : "filePatch";
  return result.type === expectedType
    ? { path: result.path, diff: result.diff }
    : undefined;
}
