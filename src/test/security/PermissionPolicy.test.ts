import * as assert from "node:assert";
import type { PermissionSnapshot } from "@/contracts";
import { shouldEnforceToolCallLimits } from "@/application/chat/toolCall/PermissionPolicy";

suite("permission policy snapshots", () => {
  test("enforces tool round limits only in default mode", () => {
    assert.strictEqual(shouldEnforceToolCallLimits(createSnapshot("default")), true);
    assert.strictEqual(shouldEnforceToolCallLimits(createSnapshot("auto-approve")), false);
    assert.strictEqual(shouldEnforceToolCallLimits(createSnapshot("full-access")), false);
  });
});

function createSnapshot(permissionMode: PermissionSnapshot["permissionMode"]): PermissionSnapshot {
  return { revision: 1, permissionMode, workspaceTrusted: true, fingerprint: "test" };
}
