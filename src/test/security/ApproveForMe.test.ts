import * as assert from "assert";
import type * as vscode from "vscode";
import type { ToolCall } from "@/adapters";
import type { ToolExecutor } from "@/core/tools/ToolExecutor";
import { setToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { executeToolCall } from "@/vscodeApi/webviews/handlers/chat/toolCalls/ToolExecution";
import type { StoredExecution, ToolExecutionContext } from "@/vscodeApi/webviews/handlers/chat/toolCalls/Types";

suite("auto approve permission mode", () => {
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
    let reviewRequests = 0;
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
    const context = createContext(
      toolExecutor,
      () => {
        confirmationRequests += 1;
        return Promise.resolve({ confirmed: false });
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return {
          decision: "manual_confirmation",
          confidence: "medium",
          reason: "The custom command cannot be verified with high confidence.",
        };
      },
    );

    const result = await executeToolCall(toolCall, context);

    assert.strictEqual(result, "Tool call cancelled by user (dangerous operation)");
    assert.strictEqual(normalExecutions, 1);
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(confirmationRequests, 1);
    assert.strictEqual(reviewRequests, 1);
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
    setWorkspacePathContainment(true);
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

suite("full access permission mode", () => {
  test("executes terminal commands directly without requesting confirmation", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "custom-build-tool --run" });
    let normalExecutions = 0;
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => {
        normalExecutions += 1;
        throw new Error("full access must not run the confirmation-producing handler");
      },
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      { autoApproveMode: false, fullAccessMode: true },
    );

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(normalExecutions, 0);
    assert.strictEqual(forcedExecutions, 1);
    assert.strictEqual(confirmationRequests, 0);
  });
});

suite("auto approve workspace boundary", () => {
  test("executes a mutating terminal command automatically when it is contained in the workspace", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "npm install" });
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    let reviewRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "Package manager command",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return {
          decision: "approve",
          confidence: "medium_high",
          reason: "The package installation is scoped to the workspace.",
        };
      },
    );

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(forcedExecutions, 1);
    assert.strictEqual(confirmationRequests, 0);
    assert.strictEqual(reviewRequests, 1);
  });

  test("auto approves an explicit non-recursive template-file deletion after review", async () => {
    const command = "del /f Welcome.astro";
    const toolCall = createToolCall("run_terminal_command", {
      command,
      cwd: "Frontend\\src\\components",
    });
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    let reviewRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "This command deletes files.",
          command,
          cwd: "C:\\workspace\\Frontend\\src\\components",
          workspaceRoot: "C:\\workspace",
          shell: "cmd.exe",
          reasonCode: "delete",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result: "completed",
          isError: false,
        };
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return {
          decision: "approve",
          confidence: "high",
          reason: "The named file is an unreferenced workspace scaffold artifact.",
        };
      },
    );

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(forcedExecutions, 1);
    assert.strictEqual(reviewRequests, 1);
    assert.strictEqual(confirmationRequests, 0);
  });

  test("keeps recursive template deletion behind manual confirmation", async () => {
    const command = "rmdir /s /q Frontend\\src\\components";
    const toolCall = createToolCall("run_terminal_command", { command });
    let confirmationRequests = 0;
    let reviewRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "destructive",
          warningMessage: "This command can recursively delete files.",
          command,
          cwd: "C:\\workspace",
          workspaceRoot: "C:\\workspace",
          shell: "cmd.exe",
          reasonCode: "destructive-delete",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        throw new Error("recursive deletion must require the user");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return {
          decision: "approve",
          confidence: "very_high",
          reason: "Should not be consulted.",
        };
      },
    );

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled by user (dangerous operation)",
    );
    assert.strictEqual(reviewRequests, 0);
    assert.strictEqual(confirmationRequests, 1);
  });

  test("does not let a remote approval override an unproven workspace boundary", async () => {
    const command = "custom-scaffolder C:\\outside\\project";
    const toolCall = createToolCall("run_terminal_command", { command });
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "This command form is not in the read-only allowlist.",
          command,
          cwd: "C:\\workspace",
          workspaceRoot: "C:\\workspace",
          shell: "cmd.exe",
          reasonCode: "not-allowlisted",
          workspaceContained: false,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        throw new Error("an unproven workspace boundary must not be auto approved");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async (_toolCall, dangerInfo) => {
        confirmationRequests += 1;
        assert.match(dangerInfo.warningMessage, /did not prove/i);
        return { confirmed: false };
      },
      undefined,
      async () => ({
        decision: "approve",
        confidence: "very_high",
        reason: "The command looks related to the requested scaffold.",
      }),
    );

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled by user (dangerous operation)",
    );
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(confirmationRequests, 1);
  });

  test("falls back to manual confirmation when the DeepSeek review fails", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "custom-build-tool --run" });
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "Unknown command",
          reasonCode: "unsupported-syntax",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async (_toolCall, dangerInfo) => {
        confirmationRequests += 1;
        assert.match(dangerInfo.warningMessage, /safety review failed/i);
        return { confirmed: false };
      },
      undefined,
      async () => {
        throw new Error("provider unavailable");
      },
    );

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled by user (dangerous operation)",
    );
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(confirmationRequests, 1);
  });

  test("returns a high-confidence rejection to the primary agent for safer replanning", async () => {
    const toolCall = createToolCall("run_terminal_command", {
      command: "custom-server-command --detach",
    });
    let forcedExecutions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "Unknown background server command",
          reasonCode: "unsupported-syntax",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        throw new Error("a rejected command must not execute");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => ({
        decision: "revise",
        confidence: "very_high",
        reason: "Use a finite foreground command with narrowly targeted cleanup.",
      }),
    );

    const result = await executeToolCall(toolCall, context);

    assert.match(result, /Security reviewer rejected this command/);
    assert.match(result, /finite foreground command/);
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(confirmationRequests, 0);
    assert.strictEqual(context.executedToolCalls.get(toolCall.id)?.status, "rejected");
  });

  test("requires manual confirmation for a low-confidence revision", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "custom-build-tool --run" });
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "Unknown command",
          reasonCode: "unsupported-syntax",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        throw new Error("low-confidence revision requires the user");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => ({
        decision: "revise",
        confidence: "very_low",
        reason: "A safer alternative might exist.",
      }),
    );

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled by user (dangerous operation)",
    );
    assert.strictEqual(confirmationRequests, 1);
  });

  test("does not let DeepSeek override a hard local process-termination block", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "taskkill /F /IM dotnet.exe" });
    let reviewRequests = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "dangerous",
          warningMessage: "The command can terminate processes outside the workspace.",
          reasonCode: "process-termination",
          workspaceContained: false,
        }),
        isError: false,
      }),
      executeForced: async () => {
        throw new Error("hard local blocks require manual confirmation");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return { decision: "approve", confidence: "very_high", reason: "Should not be consulted." };
      },
    );

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled by user (dangerous operation)",
    );
    assert.strictEqual(reviewRequests, 0);
    assert.strictEqual(confirmationRequests, 1);
  });

  test("replans detached server verification that would kill every runtime process", async () => {
    const command = [
      'start /B dotnet run --project backend/backend.csproj --urls "http://localhost:5137"',
      "timeout /T 5 /NOBREAK >nul",
      "curl -s http://localhost:5137/api/workers",
      "taskkill /F /IM dotnet.exe >nul 2>&1",
    ].join(" && ");
    const toolCall = createToolCall("run_terminal_command", { command });
    let forcedExecutions = 0;
    let reviewRequests = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "dangerous",
          warningMessage: "This command can terminate processes outside the active workspace.",
          command,
          reasonCode: "process-termination",
          workspaceContained: false,
        }),
        isError: false,
      }),
      executeForced: async () => {
        forcedExecutions += 1;
        throw new Error("detached broad-kill verification must be replanned");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return { decision: "approve", confidence: "very_high", reason: "Should not be consulted." };
      },
    );

    const result = await executeToolCall(toolCall, context);

    assert.match(result, /Security reviewer rejected this command/);
    assert.match(result, /successful normal build is sufficient/i);
    assert.strictEqual(forcedExecutions, 0);
    assert.strictEqual(reviewRequests, 0);
    assert.strictEqual(confirmationRequests, 0);
  });

  test("replans a detached development server even when no cleanup was proposed", async () => {
    const command = "dotnet build && start /B dotnet run";
    const toolCall = createToolCall("run_terminal_command", { command, cwd: "backend" });
    let confirmationRequests = 0;
    let reviewRequests = 0;
    const toolExecutor = {
      execute: async () => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        result: JSON.stringify({
          requiresConfirmation: true,
          dangerLevel: "dangerous",
          warningMessage: "Unknown or unsupported shell syntax requires explicit confirmation.",
          command,
          cwd: "C:\\workspace\\backend",
          reasonCode: "unsupported-syntax",
          workspaceContained: true,
        }),
        isError: false,
      }),
      executeForced: async () => {
        throw new Error("detached server must not execute");
      },
    } as unknown as ToolExecutor;
    const context = createContext(
      toolExecutor,
      async () => {
        confirmationRequests += 1;
        return { confirmed: false };
      },
      undefined,
      async () => {
        reviewRequests += 1;
        return { decision: "approve", confidence: "very_high", reason: "Should not be consulted." };
      },
    );

    const result = await executeToolCall(toolCall, context);

    assert.match(result, /Do not leave a detached development server running/);
    assert.strictEqual(confirmationRequests, 0);
    assert.strictEqual(reviewRequests, 0);
  });

  test("requires confirmation before an automatically approved tool accesses an external path", async () => {
    setToolWorkspaceHost({
      getRootPath: () => process.cwd(),
      isPathInsideWorkspace: async () => false,
      readFile: async () => new Uint8Array(),
      writeFile: async () => undefined,
      stat: async () => ({ type: "file", size: 0 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    const toolCall = createToolCall("read_file", { path: "C:\\outside\\secret.txt" });
    let executions = 0;
    let confirmationRequests = 0;
    const toolExecutor = {
      execute: async () => { executions += 1; throw new Error("unexpected execution"); },
      executeForced: async () => { executions += 1; throw new Error("unexpected execution"); },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor, async () => {
      confirmationRequests += 1;
      return { confirmed: false };
    });

    assert.strictEqual(
      await executeToolCall(toolCall, context),
      "Tool call cancelled because access outside the workspace was not approved",
    );
    assert.strictEqual(executions, 0);
    assert.strictEqual(confirmationRequests, 1);
  });
});

suite("full access policy enforcement", () => {
  test("continues to honor an explicitly disabled tool", async () => {
    const toolCall = createToolCall("run_terminal_command", { command: "dir" });
    let executions = 0;
    const toolExecutor = {
      execute: async () => { executions += 1; throw new Error("unexpected execution"); },
      executeForced: async () => { executions += 1; throw new Error("unexpected execution"); },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor, undefined, { autoApproveMode: false, fullAccessMode: true });
    context.getToolMode = () => "disabled";

    assert.strictEqual(await executeToolCall(toolCall, context), "Tool call rejected because the tool is disabled");
    assert.strictEqual(executions, 0);
  });
});

suite("custom permission mode", () => {
  test("auto approves only the individually delegated non-terminal tool", async () => {
    setWorkspacePathContainment(true);
    const toolCall = createToolCall("create_file", { path: "file.txt", content: "value" });
    let normalExecutions = 0;
    let forcedExecutions = 0;
    const toolExecutor = {
      execute: async () => {
        normalExecutions += 1;
        throw new Error("custom auto approval should use the forced handler");
      },
      executeForced: async () => {
        forcedExecutions += 1;
        return { toolCallId: toolCall.id, toolName: toolCall.function.name, result: "completed", isError: false };
      },
    } as unknown as ToolExecutor;
    const context = createContext(toolExecutor, undefined, { autoApproveMode: false, fullAccessMode: false });
    context.getToolMode = () => "auto_approve";

    assert.strictEqual(await executeToolCall(toolCall, context), "completed");
    assert.strictEqual(normalExecutions, 0);
    assert.strictEqual(forcedExecutions, 1);
  });
});

function createToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function setWorkspacePathContainment(contained: boolean): void {
  setToolWorkspaceHost({
    getRootPath: () => process.cwd(),
    isPathInsideWorkspace: async () => contained,
    readFile: async () => new Uint8Array(),
    writeFile: async () => undefined,
    stat: async () => ({ type: "file", size: 0 }),
    createParentDirectory: async () => undefined,
    readDirectory: async () => [],
  });
}

function createContext(
  toolExecutor: ToolExecutor,
  requestDangerConfirmation: ToolExecutionContext["requestDangerConfirmation"] = async () => ({ confirmed: false }),
  modes: Pick<ToolExecutionContext, "autoApproveMode" | "fullAccessMode"> = {
    autoApproveMode: true,
    fullAccessMode: false,
  },
  reviewDangerousCommand: ToolExecutionContext["reviewDangerousCommand"] = async () => ({
    decision: "manual_confirmation",
    confidence: "very_low",
    reason: "No safety reviewer was configured for this test.",
  }),
): ToolExecutionContext {
  return {
    toolExecutor,
    webviewView: { webview: { postMessage: () => Promise.resolve(true) } } as unknown as vscode.WebviewView,
    executedToolCalls: new Map<string, StoredExecution>(),
    ...modes,
    isWorkspaceTrusted: () => true,
    getToolMode: () => "enabled",
    getCurrentRound: () => 1,
    getPendingCycle: () => null,
    requestDangerConfirmation,
    reviewDangerousCommand,
    isDangerTrusted: () => false,
    trustDangerForSession: () => undefined,
  };
}
