import * as assert from "node:assert";
import type * as vscode from "vscode";
import type { AppConfig, ChatCompletionResponse, ToolCall } from "@/adapters";
import type { ToolExecutor } from "@/core/tools/ToolExecutor";
import { setToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import type { ConfirmationRequiredResult } from "@/core/tools/Types";
import { reviewCommandSafety } from "@/deepseekApi/security/CommandSafetyReviewer";
import { executeToolCall } from "@/vscodeApi/webviews/handlers/chat/toolCalls/ToolExecution";
import type {
  StoredExecution,
  ToolExecutionContext,
} from "@/vscodeApi/webviews/handlers/chat/toolCalls/Types";

const ORIGINAL_REQUEST = [
  "Create a local work-time tracker using ASP.NET and Astro with JSON persistence.",
  "Use npm create astro@latest and dotnet, and minimize output rounds.",
].join(" ");

const RECORDED_COMMANDS = [
  "mkdir horario-laboral && cd horario-laboral && dotnet new webapi -n backend --no-https -o backend && npx create-astro@latest frontend --yes --no-git --template minimal --skip-houston 2>&1",
  "cd horario-laboral/frontend && npm install && npm install @astrojs/svelte svelte 2>&1",
  "cd horario-laboral/backend && dotnet build 2>&1",
  "cd horario-laboral/frontend && npx astro build 2>&1",
  "cd horario-laboral/backend && start /B dotnet run 2>&1 && timeout /t 5 /nobreak >nul && curl -s http://localhost:5000/api/workers 2>&1",
  "cd horario-laboral/backend && dotnet run & sleep 5 & curl -s http://localhost:5000/api/workers",
  "taskkill /F /IM dotnet.exe 2>nul & timeout /t 2 /nobreak >nul & echo done",
  "cd horario-laboral/backend && dotnet build 2>&1 && start /B dotnet run 2>&1",
  "mkdir timeclock-app && cd timeclock-app && npm create astro@latest web -- --template minimal --no-install --no-git --yes 2>&1",
  "cd timeclock-app && dotnet new webapi -n api --no-https -o api 2>&1",
  "cd timeclock-app/web && npm install 2>&1",
  "cd timeclock-app/api && dotnet build 2>&1",
  'cd timeclock-app/api && start /B dotnet run --urls "http://localhost:5009" 2>&1 && timeout /T 3 >nul && curl -s http://localhost:5009/api/employees 2>&1',
  "npm create astro@latest -- --template minimal astro-app --yes 2>&1",
  "dotnet new webapi -n backend --no-https -o backend",
  "npm create astro@latest -- frontend --template minimal --no-git --no-install --typescript strict 2>&1",
  "cd frontend && npm install 2>&1",
  "dotnet build backend/backend.csproj 2>&1",
  "dotnet build backend/backend.csproj --no-restore 2>&1",
  "dotnet clean backend/backend.csproj 2>&1 && dotnet build backend/backend.csproj 2>&1",
  'start /B dotnet run --project backend/backend.csproj --urls "http://localhost:5137" && timeout /T 5 /NOBREAK >nul && curl -s http://localhost:5137/api/workers && taskkill /F /IM dotnet.exe >nul 2>&1',
  "dotnet --version && node --version && npm --version",
  "mkdir time-tracker && cd time-tracker && dotnet new webapi -n backend --no-https -o backend",
  "mkdir fullstack-time-tracker && dotnet new webapi -n backend --no-https -o fullstack-time-tracker/backend && npm create astro@latest frontend -- --template minimal --no-install --yes 2>&1 || cd fullstack-time-tracker && npm create astro@latest frontend -- --template minimal --no-install 2>&1",
  "mkdir C:\\Users\\invented\\Desktop\\horas-app",
  "mkdir horas-app && cd horas-app && mkdir backend frontend",
  "del /f Welcome.astro",
  "del /f astro.svg background.svg",
  "cd",
  "echo %cd%",
] as const;

suite("recorded full-stack autonomy regression", () => {
  test("keeps at least 90% of observed terminal proposals unattended", async () => {
    setToolWorkspaceHost({
      getRootPath: () => "C:\\workspace",
      readFile: async () => new Uint8Array(),
      writeFile: async () => undefined,
      stat: async () => ({ type: "directory", size: 0 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    let manualConfirmations = 0;
    let forcedExecutions = 0;

    for (const [index, command] of RECORDED_COMMANDS.entries()) {
      const toolCall = createToolCall(index, command);
      const confirmation = createLocalResult(command);
      const toolExecutor = {
        execute: async () => ({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result: confirmation ? JSON.stringify(confirmation) : "completed",
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
          manualConfirmations += 1;
          return { confirmed: false };
        },
      );

      await executeToolCall(toolCall, context);
    }

    const unattendedRate =
      (RECORDED_COMMANDS.length - manualConfirmations) / RECORDED_COMMANDS.length;
    assert.ok(
      unattendedRate >= 0.9,
      `Expected >=90% unattended routing, got ${(unattendedRate * 100).toFixed(1)}%`,
    );
    assert.strictEqual(manualConfirmations, 1);
    assert.ok(forcedExecutions >= 15);
  });
});

function createLocalResult(command: string): ConfirmationRequiredResult | undefined {
  if (/^(?:cd|echo\s+%cd%)$/i.test(command.trim())) {
    return undefined;
  }
  const processTermination = /\btaskkill\b/i.test(command);
  const inventedExternalPath = /\bC:\\Users\\invented\\/i.test(command);
  const packageManager = /\b(?:npm|npx)\b/i.test(command);
  const explicitDelete = /^\s*del\s+\/f\s+(?!.*[*?[\]{}])\S+(?:\s+\S+)*\s*$/i.test(command);
  return {
    requiresConfirmation: true,
    dangerLevel: processTermination
      ? "dangerous"
      : packageManager || explicitDelete
        ? "caution"
        : "dangerous",
    warningMessage: processTermination
      ? "This command can terminate processes outside the active workspace."
      : explicitDelete
        ? "This command deletes explicitly named files."
      : "Unknown or unsupported shell syntax requires explicit confirmation.",
    command,
    cwd: "C:\\workspace",
    workspaceRoot: "C:\\workspace",
    shell: "cmd.exe",
    reasonCode: processTermination
      ? "process-termination"
      : explicitDelete
        ? "delete"
      : packageManager && !/[&|]/.test(command)
        ? "package-manager"
        : "unsupported-syntax",
    workspaceContained: !processTermination && !inventedExternalPath,
  };
}

function createContext(
  toolExecutor: ToolExecutor,
  requestDangerConfirmation: ToolExecutionContext["requestDangerConfirmation"],
): ToolExecutionContext {
  return {
    toolExecutor,
    webviewView: {
      webview: { postMessage: () => Promise.resolve(true) },
    } as unknown as vscode.WebviewView,
    executedToolCalls: new Map<string, StoredExecution>(),
    autoApproveMode: true,
    fullAccessMode: false,
    isWorkspaceTrusted: () => true,
    getToolMode: () => "enabled",
    getCurrentRound: () => 1,
    getPendingCycle: () => null,
    requestDangerConfirmation,
    reviewDangerousCommand: (toolCall, localAnalysis) =>
      reviewCommandSafety({
        toolCall,
        localAnalysis,
        providerConfig: createProviderConfig(),
        originalUserRequest: ORIGINAL_REQUEST,
        workspaceRoot: "C:\\workspace",
        complete: async (_signal, request) => {
          const payload = JSON.parse(
            request.messages.find((message) => message.role === "user")?.content || "{}",
          ) as { command?: string };
          const reviewedCommand = payload.command ?? "";
          if (/C:\\Users\\invented\\/i.test(reviewedCommand)) {
            return response("revise", "very_high", "Use the active workspace instead of an invented absolute path.");
          }
          if (/\bdotnet\s+run\s*&/i.test(reviewedCommand)) {
            return response("revise", "very_high", "Use the normal build as finite verification.");
          }
          if (/&&/.test(reviewedCommand) && /\|\|/.test(reviewedCommand)) {
            return response("manual_confirmation", "medium", "The mixed fallback is ambiguous.");
          }
          return response("approve", "medium_high", "The operation is finite, requested, and workspace scoped.");
        },
      }),
    isDangerTrusted: () => false,
    trustDangerForSession: () => undefined,
  };
}

function createToolCall(index: number, command: string): ToolCall {
  return {
    id: `recorded-command-${index}`,
    type: "function",
    function: {
      name: "run_terminal_command",
      arguments: JSON.stringify({ command }),
    },
  };
}

function createProviderConfig(): AppConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  } as AppConfig;
}

function response(
  decision: "approve" | "revise" | "manual_confirmation",
  confidence: "very_high" | "high" | "medium_high" | "medium" | "medium_low" | "low" | "very_low",
  reason: string,
): ChatCompletionResponse {
  return {
    id: "review",
    object: "chat.completion",
    created: 0,
    model: "deepseek-chat",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: JSON.stringify({ decision, confidence, reason }),
      },
      finish_reason: "stop",
    }],
  };
}
