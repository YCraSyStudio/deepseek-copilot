import { resolveToolExecutionMode } from "@/contracts";
import type { PermissionSnapshot, ToolDefinition, ToolExecutionMode } from "@/contracts";

export function getRunnableToolsForPermissionSnapshot(
  tools: ToolDefinition[],
  snapshot: PermissionSnapshot,
): ToolDefinition[] {
  return tools.filter((tool) =>
    getToolModeForPermissionSnapshot(snapshot, tool.function.name) !== "disabled"
  );
}

export function getToolModeForPermissionSnapshot(snapshot: PermissionSnapshot, toolName: string): ToolExecutionMode {
  return resolveToolExecutionMode(snapshot.permissionMode, toolName, snapshot.toolExecutionModes);
}

export function shouldEnforceToolCallLimits(snapshot: PermissionSnapshot): boolean {
  return snapshot.permissionMode !== "auto-approve" && snapshot.permissionMode !== "full-access";
}
