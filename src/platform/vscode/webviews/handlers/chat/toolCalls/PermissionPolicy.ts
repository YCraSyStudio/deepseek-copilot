import type { PermissionSnapshot, ToolDefinition } from "@/contracts";

export function getRunnableToolsForPermissionSnapshot(
  tools: ToolDefinition[],
  snapshot: PermissionSnapshot,
): ToolDefinition[] {
  void snapshot;
  return tools;
}

export function shouldEnforceToolCallLimits(snapshot: PermissionSnapshot): boolean {
  return snapshot.permissionMode === "default";
}
