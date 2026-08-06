import * as assert from "node:assert";
import type { PermissionSnapshot, ToolDefinition } from "@/adapters";
import {
  getRunnableToolsForPermissionSnapshot,
  getToolModeForPermissionSnapshot,
} from "@/vscodeApi/webviews/handlers/chat/toolCalls/PermissionPolicy";

const tools = ["read_file", "read_web_page", "create_file", "run_terminal_command"].map((name) => ({
  type: "function",
  function: { name, description: name, parameters: { type: "object", properties: {} } },
})) as ToolDefinition[];

suite("permission policy snapshots", () => {
  test("keeps the default preset fixed and requires confirmation for every tool", () => {
    const snapshot = createSnapshot("default", { read_file: "disabled", create_file: "auto_approve" });
    assert.deepStrictEqual(
      getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name),
      ["read_file", "read_web_page", "create_file", "run_terminal_command"],
    );
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "read_file"), "enabled");
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "create_file"), "enabled");
  });

  test("auto approves read tools in read only while keeping mutations enabled", () => {
    const snapshot = createSnapshot("read-only", { read_file: "disabled", create_file: "auto_approve" });
    assert.deepStrictEqual(
      getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name),
      ["read_file", "read_web_page", "create_file", "run_terminal_command"],
    );
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "read_file"), "auto_approve");
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "read_web_page"), "auto_approve");
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "create_file"), "enabled");
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "run_terminal_command"), "enabled");
  });

  test("keeps auto approve fixed even when custom settings disable tools", () => {
    const snapshot = createSnapshot("auto-approve", { create_file: "disabled" });
    assert.deepStrictEqual(
      getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name),
      ["read_file", "read_web_page", "create_file", "run_terminal_command"],
    );
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "create_file"), "auto_approve");
  });

  test("keeps full access fixed even when custom settings contain a disabled tool", () => {
    const snapshot = createSnapshot("full-access", { run_terminal_command: "disabled" });
    assert.deepStrictEqual(
      getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name),
      ["read_file", "read_web_page", "create_file", "run_terminal_command"],
    );
  });

  test("full access always uses automatic execution", () => {
    assert.strictEqual(getToolModeForPermissionSnapshot(createSnapshot("full-access"), "run_terminal_command"), "auto_approve");
    assert.strictEqual(
      getToolModeForPermissionSnapshot(createSnapshot("full-access", { run_terminal_command: "enabled" }), "run_terminal_command"),
      "auto_approve",
    );
  });

  test("uses individual tool settings only in custom mode", () => {
    const snapshot = createSnapshot("custom", {
      read_file: "auto_approve",
      create_file: "disabled",
      run_terminal_command: "enabled",
    });
    assert.deepStrictEqual(
      getRunnableToolsForPermissionSnapshot(tools, snapshot).map((tool) => tool.function.name),
      ["read_file", "read_web_page", "run_terminal_command"],
    );
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "read_file"), "auto_approve");
    assert.strictEqual(getToolModeForPermissionSnapshot(snapshot, "run_terminal_command"), "enabled");
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
