import * as assert from "node:assert";
import type { ToolCall } from "@/contracts";
import type { ToolExecutor } from "@/application/tools/ToolExecutor";
import { executeToolCall } from "@/platform/vscode/webviews/handlers/chat/toolCalls/ToolExecution";
import type { ToolExecutionContext } from "@/platform/vscode/webviews/handlers/chat/toolCalls/Types";
import type { CommandSafetyRisk } from "@/infrastructure/deepseek/security/commandReview";
import { runWithToolWorkspaceHost, type ToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";

type PermissionMode = "auto-approve" | "full-access" | "default";

const DIAGNOSTIC_COMMAND = "dotnet --version && node --version && npm --version";

suite("remote permission decisions", () => {
  test("auto-approve runs routine mutations after DeepSeek review", async () => {
    const harness = createHarness("routine", "auto-approve");
    assert.strictEqual(await executeToolCall(call("run_terminal_command"), harness.context), "completed");
    assert.strictEqual(harness.forced(), 1);
    assert.strictEqual(harness.confirmations(), 0);
  });

  test("auto-approve confirms elevated mutations", async () => {
    const harness = createHarness("elevated", "auto-approve");
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.confirmations(), 1);
  });

  test("full-access runs elevated mutations automatically", async () => {
    const harness = createHarness("elevated", "full-access");
    assert.strictEqual(await executeToolCall(call("run_terminal_command"), harness.context), "completed");
    assert.strictEqual(harness.forced(), 1);
    assert.strictEqual(harness.confirmations(), 0);
  });

  test("full-access still confirms critical mutations", async () => {
    const harness = createHarness("critical", "full-access");
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.confirmations(), 1);
  });

  test("automatic modes do not spend a review call on read-only tools", async () => {
    const harness = createHarness("critical", "auto-approve");
    assert.strictEqual(await executeToolCall(call("read_file"), harness.context), "completed");
    assert.strictEqual(harness.reviews(), 0);
    assert.strictEqual(harness.forced(), 1);
  });

  test("auto-approve runs chained version diagnostics without a review call", async () => {
    const harness = createHarness("critical", "auto-approve", { command: DIAGNOSTIC_COMMAND });
    assert.strictEqual(await executeToolCall(call("run_terminal_command"), harness.context), "completed");
    assert.strictEqual(harness.reviews(), 0);
    assert.strictEqual(harness.confirmations(), 0);
    assert.strictEqual(harness.forced(), 1);
  });

  test("auto-approve still reviews a command with unproven effects", async () => {
    const harness = createHarness("routine", "auto-approve", { command: "npm run build" });
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.reviews(), 1);
  });

  test("manual mode never auto-executes a deterministic diagnostic", async () => {
    const harness = createHarness("routine", "default", { command: DIAGNOSTIC_COMMAND });
    await executeToolCall(call("run_terminal_command"), harness.context);
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.reviews(), 0);
  });

  test("auto-approve runs a contained file edit without a review call", async () => {
    const harness = createHarness("routine", "auto-approve", { toolName: "edit_file", fileMutation: true });
    const host = createWorkspaceHost(true);
    const result = await runWithToolWorkspaceHost(
      host,
      () => executeToolCall(call("edit_file"), harness.context),
    );
    assert.strictEqual(result, "completed");
    assert.strictEqual(harness.reviews(), 0);
    assert.strictEqual(harness.confirmations(), 0);
    assert.strictEqual(harness.forced(), 1);
  });

  test("auto-approve keeps a file edit outside the workspace in review", async () => {
    const harness = createHarness("elevated", "auto-approve", { toolName: "edit_file", fileMutation: true });
    const host = createWorkspaceHost(false);
    await runWithToolWorkspaceHost(
      host,
      () => executeToolCall(call("edit_file"), harness.context),
    );
    assert.strictEqual(harness.forced(), 0);
    assert.strictEqual(harness.confirmations(), 1);
  });
});

interface HarnessOptions {
  command?: string;
  toolName?: string;
  fileMutation?: boolean;
}

function createHarness(risk: CommandSafetyRisk, mode: PermissionMode, options: HarnessOptions = {}) {
  const toolName = options.toolName ?? "run_terminal_command";
  let forced = 0;
  let confirmations = 0;
  let reviews = 0;
  const confirmation = options.fileMutation
    ? JSON.stringify({
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "Apply 1 replacement?",
        filePath: "src/app.ts",
        beforeHash: "before-hash",
      })
    : JSON.stringify({
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "Review required",
        command: options.command ?? "npm test",
        reasonCode: "remote-review-required",
      });
  const toolExecutor = {
    execute: async () => ({
      toolCallId: "call",
      toolName,
      outcome: { kind: "confirmation_required", content: confirmation, dangerLevel: "caution" },
      status: "confirmation_required",
    }),
    executeForced: async () => {
      forced += 1;
      return {
        toolCallId: "call",
        toolName: "tool",
        outcome: { kind: "completed", content: "completed" },
        status: "completed",
      };
    },
    getMetadata: (name: string) => name === "read_file"
      ? { dangerLevel: "safe", requiresConfirmation: false, effect: "read-only" }
      : { dangerLevel: "caution", requiresConfirmation: true, effect: "workspace-mutation" },
  } as unknown as ToolExecutor;
  const context: ToolExecutionContext = {
    toolExecutor,
    eventSink: { publish: () => undefined },
    executedToolCalls: new Map(),
    autoApproveMode: mode === "auto-approve",
    fullAccessMode: mode === "full-access",
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

function createWorkspaceHost(contained: boolean): ToolWorkspaceHost {
  return {
    getRootPath: () => "/workspace",
    getWorkspaceId: () => "workspace:test",
    isPathInsideWorkspace: async () => contained,
    readFile: async () => new Uint8Array(),
    writeFile: async () => undefined,
    stat: async () => ({ type: "file", size: 0 }),
    createParentDirectory: async () => undefined,
    readDirectory: async () => [],
  } as unknown as ToolWorkspaceHost;
}

function call(name: string): ToolCall {
  return {
    id: "call",
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(name === "run_terminal_command"
        ? { command: "npm test" }
        : name === "edit_file"
          ? { path: "src/app.ts", search: "a", replace: "b" }
          : { path: "README.md" }),
    },
  };
}
