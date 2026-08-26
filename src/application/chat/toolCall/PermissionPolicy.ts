import type { PermissionSnapshot } from "@/contracts";

/**
 * Default mode keeps a human in the loop when the tool-call budget is reached.
 * Automatic modes intentionally allow the configured round budget to continue
 * without an additional interaction.
 */
export function shouldEnforceToolCallLimits(snapshot: PermissionSnapshot): boolean {
  return snapshot.permissionMode === "default";
}
