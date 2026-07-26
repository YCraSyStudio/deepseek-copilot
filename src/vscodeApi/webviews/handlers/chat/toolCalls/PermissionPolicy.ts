import { resolveToolExecutionMode } from "@/adapters";
import type { PermissionSnapshot, ToolDefinition, ToolExecutionMode } from "@/adapters";

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
