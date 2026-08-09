import * as assert from "node:assert";
import type { ToolCall } from "@/contracts";
import type { ConfirmationRequiredResult } from "@/application/tools/Types";
import { DangerTrustStore, type DangerTrustScope } from "@/platform/vscode/webviews/handlers/chat/toolCalls/DangerTrustStore";

suite("danger trust store", () => {
  const baseScope: DangerTrustScope = {
    conversationId: "conversation-1",
    workspaceUri: "file:///workspace-a",
    configFingerprint: "config-a",
  };
  const confirmation: ConfirmationRequiredResult = {
    requiresConfirmation: true,
    dangerLevel: "caution",
    warningMessage: "Review",
    reasonCode: "not-allowlisted",
    command: "custom-tool --run",
    normalizedCommand: "\"custom-tool\" \"--run\"",
    cwd: "/workspace-a",
    shell: "/bin/bash",
  };

  test("reuses an exact operation across generations of one conversation", () => {
    const store = new DangerTrustStore();
    const original = call("call-generation-1", { command: "custom-tool --run", timeoutMs: 30_000 });
    const nextGeneration = call("call-generation-2", { timeoutMs: 30_000, command: "custom-tool --run" });

    store.trust(baseScope, original, confirmation);

    assert.strictEqual(store.isTrusted(baseScope, nextGeneration, confirmation), true);
  });

  test("isolates conversation, workspace, configuration, and arguments", () => {
    const store = new DangerTrustStore();
    const original = call("call-1", { command: "custom-tool --run" });
    store.trust(baseScope, original, confirmation);

    assert.strictEqual(store.isTrusted({ ...baseScope, conversationId: "conversation-2" }, original, confirmation), false);
    assert.strictEqual(store.isTrusted({ ...baseScope, workspaceUri: "file:///workspace-b" }, original, confirmation), false);
    assert.strictEqual(store.isTrusted({ ...baseScope, configFingerprint: "config-b" }, original, confirmation), false);
    assert.strictEqual(store.isTrusted(baseScope, call("call-2", { command: "custom-tool --other" }), confirmation), false);
    assert.strictEqual(store.isTrusted(baseScope, original, { ...confirmation, cwd: "/workspace-a/subdir" }), false);
    assert.strictEqual(store.isTrusted(baseScope, original, { ...confirmation, shell: "/bin/zsh" }), false);
  });

  test("never delegates destructive confirmations", () => {
    const store = new DangerTrustStore();
    const toolCall = call("call-1", { command: "rm -rf dist" });
    const destructive = { ...confirmation, dangerLevel: "destructive" as const, command: "rm -rf dist" };

    store.trust(baseScope, toolCall, destructive);

    assert.strictEqual(store.isTrusted(baseScope, toolCall, destructive), false);
  });

  test("clears only the requested scope or every scope", () => {
    const store = new DangerTrustStore();
    const toolCall = call("call-1", { command: "custom-tool --run" });
    const otherScope = { ...baseScope, conversationId: "conversation-2" };
    store.trust(baseScope, toolCall, confirmation);
    store.trust(otherScope, toolCall, confirmation);

    store.clearScope(baseScope);
    assert.strictEqual(store.isTrusted(baseScope, toolCall, confirmation), false);
    assert.strictEqual(store.isTrusted(otherScope, toolCall, confirmation), true);

    store.clear();
    assert.strictEqual(store.isTrusted(otherScope, toolCall, confirmation), false);
  });
});

function call(id: string, args: Record<string, unknown>): ToolCall {
  return {
    id,
    type: "function",
    function: { name: "run_terminal_command", arguments: JSON.stringify(args) },
  };
}
