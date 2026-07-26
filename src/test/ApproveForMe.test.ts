import * as assert from "assert";
import type * as vscode from "vscode";
import { PERMISSION_MODE_ALLOWED_TOOLS, type ToolCall } from "@/adapters";
import type { ToolExecutor } from "@/core/tools/ToolExecutor";
import { setToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { executeToolCall } from "@/vscodeApi/webviews/handlers/chat/toolCalls/ToolExecution";
import type { StoredExecution, ToolExecutionContext } from "@/vscodeApi/webviews/handlers/chat/toolCalls/Types";

suite("auto approve permission mode", () => {
  test("is a global permission mode with access to every non-disabled tool", () => {
    assert.strictEqual(PERMISSION_MODE_ALLOWED_TOOLS["auto-approve"], null);
  });

  test("runs terminal analysis and confirms a non-safe command", async () => {
    setToolWorkspaceHost({
      getRootPath: () => process.cwd(),
      readFile: async () => new Uint8Array(),
      writeFile: async () => undefined,
      stat: async () => ({ type: "file", size: 0 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    const toolCall = createToolCall("run_terminal_command", { command: "custom-build-tool --run" });
    let normalExecutions = 0;
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => {
        normalExecutions += 1;
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result: JSON.stringify({
            requiresConfirmation: true,
            dangerLevel: "caution",
            warningMessage: "Unknown command",
            command: "custom-build-tool --run",
            cwd: "C:\\workspace",
            shell: "cmd.exe",
          }),
          isError: false,
        };
      },
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor, () => {
      confirmationRequests += 1;
      return Promise.resolve({ confirmed: false });
    });

    const result = await executeToolCall(toolCall, context);

    assert.strictEqual(result, "Tool call cancelled by user (dangerous operation)");
    assert.strictEqual(normalExecutions, 1);
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(confirmationRequests, 1);
    assert.strictEqual(context.executedToolCalls.get(toolCall.id)?.status, "rejected");
  });

  test("executes an allowlisted terminal command after normal analysis", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "dir" });
    let forcedExecutions = 0;
    const toolExecutor = {
      execute: async () => ({ toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false }),
      executeForced: async () => {
        forcedExecutions += 1;
        throw new Error("safe terminal commands should not use the forced handler");
      },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor);

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(forcedExecutions, 0);
  });

  test("retains direct delegation for non-terminal tools", async () => {
    const toolCall = createToolCall("create_file", { path: "file.txt", content: "value" });
    let normalExecutions = 0;
    let forcedExecutions = 0;
    const toolExecutor = {
      execute: async () => {
        normalExecutions += 1;
        throw new Error("non-terminal global delegation should use the forced handler");
      },
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor);

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(normalExecutions, 0);
    assert.strictEqual(forcedExecutions, 1);
  });
});

function createToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function createContext(
  toolExecutor: ToolExecutor,
  requestDangerConfirmation: ToolExecutionContext["requestDangerConfirmation"] = async () => ({ confirmed: false }),
): ToolExecutionContext {
  return {
    toolExecutor,
    webviewView: { webview: { postMessage: () => Promise.resolve(true) } } as unknown as vscode.WebviewView,
    executedToolCalls: new Map<string, StoredExecution>(),
    autoApproveMode: true,
    isWorkspaceTrusted: () => true,
    getToolMode: () => "enabled",
    getCurrentRound: () => 1,
    getPendingCycle: () => null,
    requestDangerConfirmation,
    isDangerTrusted: () => false,
    trustDangerForSession: () => undefined,
  };
}
