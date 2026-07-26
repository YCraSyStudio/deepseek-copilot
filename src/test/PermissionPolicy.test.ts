import * as assert from "node:assert";
import type { PermissionSnapshot, ToolDefinition } from "@/adapters";
import {
  getRunnableToolsForPermissionSnapshot,
  getToolModeForPermissionSnapshot,
} from "@/vscodeApi/webviews/handlers/chat/toolCalls/PermissionPolicy";

const tools = ["read_file", "create_file", "run_terminal_command"].map((name) => ({
  type: "function",
  function: { name, description: name, parameters: { type: "object", properties: {} } },
})) as ToolDefinition[];

suite("permission policy snapshots", () => {
  test("applies a downgrade before a tool round", () => {
    const snapshot = createSnapshot("read-only");
    assert.deepStrictEqual(getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name), ["read_file"]);
  });

  test("keeps global full access while honoring disabled tools", () => {
    const snapshot = createSnapshot("full-access", { run_terminal_command: "disabled" });
    assert.deepStrictEqual(getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name), ["read_file", "create_file"]);
  });

  test("full access defaults tools to automatic execution while retaining explicit configuration", () => {
    assert.strictEqual(getToolModeForPermissionSnapshot(createSnapshot("full-access"), "run_terminal_command"), "auto_approve");
    assert.strictEqual(
      getToolModeForPermissionSnapshot(createSnapshot("full-access", { run_terminal_command: "enabled" }), "run_terminal_command"),
      "enabled",
    );
  });
});

function createSnapshot(
  permissionMode: PermissionSnapshot["permissionMode"],
  toolExecutionModes: PermissionSnapshot["toolExecutionModes"] = {},
): PermissionSnapshot {
  return {
    revision: 1,
    permissionMode,
    toolExecutionModes,
    workspaceTrusted: true,
    fingerprint: "test",
  };
}
