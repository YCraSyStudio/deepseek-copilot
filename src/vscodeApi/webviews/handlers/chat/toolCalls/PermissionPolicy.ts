import { getDefaultToolExecutionMode, PERMISSION_MODE_ALLOWED_TOOLS } from "@/adapters";
import type { PermissionSnapshot, ToolDefinition, ToolExecutionMode } from "@/adapters";

export function getRunnableToolsForPermissionSnapshot(
  tools: ToolDefinition[],
  snapshot: PermissionSnapshot,
): ToolDefinition[] {
  const allowed = PERMISSION_MODE_ALLOWED_TOOLS[snapshot.permissionMode];
  return tools.filter((tool) =>
    (allowed === null || allowed.includes(tool.function.name)) &&
    getToolModeForPermissionSnapshot(snapshot, tool.function.name) !== "disabled"
  );
}

export function getToolModeForPermissionSnapshot(snapshot: PermissionSnapshot, toolName: string): ToolExecutionMode {
  return snapshot.toolExecutionModes[toolName] ?? getDefaultToolExecutionMode(snapshot.permissionMode);
}
