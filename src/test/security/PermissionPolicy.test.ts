import * as assert from "node:assert";
import type { PermissionSnapshot, ToolDefinition } from "@/contracts";
import { getRunnableToolsForPermissionSnapshot } from "@/platform/vscode/webviews/handlers/chat/toolCalls/PermissionPolicy";

const tools = ["read_file", "read_web", "create_file", "run_terminal_command"].map((name) => ({
  type: "function",
  function: { name, description: name, parameters: { type: "object", properties: {} } },
})) as ToolDefinition[];

suite("permission policy snapshots", () => {
  test("keeps every runtime-available tool in all three modes", () => {
    for (const mode of ["default", "auto-approve", "full-access"] as const) {
      assert.deepStrictEqual(
        getRunnableToolsForPermissionSnapshot(tools, createSnapshot(mode)).map((tool) => tool.function.name),
        ["read_file", "read_web", "create_file", "run_terminal_command"],
      );
    }
  });
});

function createSnapshot(permissionMode: PermissionSnapshot["permissionMode"]): PermissionSnapshot {
  return { revision: 1, permissionMode, workspaceTrusted: true, fingerprint: "test" };
}
