import type { PermissionSnapshot, ToolDefinition } from "@/contracts";

export function getRunnableToolsForPermissionSnapshot(
  tools: ToolDefinition[],
  snapshot: PermissionSnapshot,
): ToolDefinition[] {
  void snapshot;
  return tools;
}
