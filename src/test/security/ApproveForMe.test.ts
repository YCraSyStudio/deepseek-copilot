import * as assert from "node:assert";
import type { ToolCall } from "@/contracts";
import type { ToolExecutor } from "@/application/tools/ToolExecutor";
import { executeToolCall } from "@/platform/vscode/webviews/handlers/chat/toolCalls/ToolExecution";
import type { ToolExecutionContext } from "@/platform/vscode/webviews/handlers/chat/toolCalls/Types";
import type { CommandSafetyRisk } from "@/infrastructure/deepseek/security/commandReview";

suite("remote permission decisions", () => {
  test("auto-approve runs routine mutations after DeepSeek review", async () => {
    const harness = createHarness("routine", false);
    assert.strictEqual(await executeToolCall(call("run_terminal_command"), harness.context), "completed");
    assert.strictEqual(harness.forced(), 1);
    assert.strictEqual(harness.confirmations(), 0);
  });

  test("auto-approve confirms elevated mutations", async () => {
    const harness = createHarness("elevated", false);
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.confirmations(), 1);
  });

  test("full-access runs elevated mutations automatically", async () => {
    const harness = createHarness("elevated", true);
    assert.strictEqual(await executeToolCall(call("run_terminal_command"), harness.context), "completed");
    assert.strictEqual(harness.forced(), 1);
    assert.strictEqual(harness.confirmations(), 0);
  });

  test("full-access still confirms critical mutations", async () => {
    const harness = createHarness("critical", true);
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.confirmations(), 1);
  });

  test("automatic modes do not spend a review call on read-only tools", async () => {
    const harness = createHarness("critical", false);
    assert.strictEqual(await executeToolCall(call("read_file"), harness.context), "completed");
    assert.strictEqual(harness.reviews(), 0);
    assert.strictEqual(harness.forced(), 1);
  });
});

function createHarness(risk: CommandSafetyRisk, fullAccessMode: boolean) {
  let forced = 0;
  let confirmations = 0;
  let reviews = 0;
  const confirmation = JSON.stringify({
    requiresConfirmation: true,
    dangerLevel: "caution",
    warningMessage: "Review required",
    command: "npm test",
    reasonCode: "remote-review-required",
  });
  const toolExecutor = {
    execute: async () => ({ toolCallId: "call", toolName: "run_terminal_command", result: confirmation, isError: false }),
    executeForced: async () => {
      forced += 1;
      return { toolCallId: "call", toolName: "tool", result: "completed", isError: false };
    },
    getMetadata: (toolName: string) => toolName === "read_file"
      ? { dangerLevel: "safe", requiresConfirmation: false, effect: "read-only" }
      : { dangerLevel: "caution", requiresConfirmation: true, effect: "workspace-mutation" },
  } as unknown as ToolExecutor;
  const context: ToolExecutionContext = {
    toolExecutor,
    eventSink: { publish: () => undefined },
    executedToolCalls: new Map(),
    autoApproveMode: !fullAccessMode,
    fullAccessMode,
    isWorkspaceTrusted: () => true,
    getCurrentRound: () => 1,
    getPendingCycle: () => null,
    requestDangerConfirmation: async () => {
      confirmations += 1;
      return { confirmed: false };
    },
    reviewDangerousCommand: async () => {
      reviews += 1;
      return { decision: "approve", risk, confidence: "very_high", reason: `${risk} action` };
    },
  };
  return { context, forced: () => forced, confirmations: () => confirmations, reviews: () => reviews };
}

function call(name: string): ToolCall {
  return { id: "call", type: "function", function: { name, arguments: JSON.stringify(name === "run_terminal_command" ? { command: "npm test" } : { path: "README.md" }) } };
}
