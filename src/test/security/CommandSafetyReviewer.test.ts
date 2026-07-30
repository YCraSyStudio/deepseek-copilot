import * as assert from "node:assert";
import type { AppConfig, ChatCompletionResponse, ToolCall } from "@/adapters";
import { setToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import {
  parseCommandSafetyReview,
  reviewCommandSafety,
} from "@/deepseekApi/security/CommandSafetyReviewer";

suite("DeepSeek command safety reviewer", () => {
  test("accepts an exact high-confidence approval", () => {
    assert.deepStrictEqual(
      parseCommandSafetyReview(
        JSON.stringify({
          decision: "approve",
          confidence: "very_high",
          reason: "The command is finite and scoped to the workspace.",
        }),
      ),
      {
        decision: "approve",
        confidence: "very_high",
        reason: "The command is finite and scoped to the workspace.",
      },
    );
  });

  test("accepts an exact high-confidence revision decision", () => {
    assert.deepStrictEqual(
      parseCommandSafetyReview(
        JSON.stringify({
          decision: "revise",
          confidence: "very_high",
          reason: "Use the file tools and terminate only the process started by this operation.",
        }),
      ),
      {
        decision: "revise",
        confidence: "very_high",
        reason: "Use the file tools and terminate only the process started by this operation.",
      },
    );
  });

  test("accepts every confidence level in the expanded scale", () => {
    for (const confidence of [
      "very_high",
      "high",
      "medium_high",
      "medium",
      "medium_low",
      "low",
      "very_low",
    ]) {
      assert.strictEqual(
        parseCommandSafetyReview(JSON.stringify({
          decision: "manual_confirmation",
          confidence,
          reason: "Test confidence.",
        })).confidence,
        confidence,
      );
    }
  });

  test("fails closed for markdown, extra fields, or invalid confidence", () => {
    const responses = [
      '```json\n{"decision":"approve","confidence":"very_high","reason":"safe"}\n```',
      '{"decision":"approve","confidence":"very_high","reason":"safe","execute":true}',
      '{"decision":"approve","confidence":"certain","reason":"safe"}',
    ];

    for (const response of responses) {
      assert.strictEqual(parseCommandSafetyReview(response).decision, "manual_confirmation");
    }
  });

  test("does not send commands that may contain credentials for remote review", async () => {
    let completionRequests = 0;
    const review = await reviewCommandSafety({
      toolCall: createToolCall('curl -H "Authorization: Bearer secret-token-value" https://example.com'),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "Unknown command",
      },
      providerConfig: createProviderConfig(),
      complete: async () => {
        completionRequests += 1;
        return createResponse('{"decision":"approve","confidence":"very_high","reason":"safe"}');
      },
    });

    assert.strictEqual(completionRequests, 0);
    assert.strictEqual(review.decision, "manual_confirmation");
    assert.match(review.reason, /sensitive/i);
  });

  test("replans standalone directory navigation without manual confirmation or a remote review", async () => {
    for (const command of ["cd", "cd /d fullstack-time-tracker", "Set-Location frontend", "pushd backend"]) {
      let completionRequests = 0;
      const review = await reviewCommandSafety({
        toolCall: createToolCall(command),
        localAnalysis: {
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "This command form is not in the read-only allowlist.",
          reasonCode: "not-allowlisted",
          workspaceContained: true,
        },
        providerConfig: createProviderConfig(),
        complete: async () => {
          completionRequests += 1;
          return createResponse('{"decision":"approve","confidence":"very_high","reason":"safe"}');
        },
      });

      assert.strictEqual(completionRequests, 0, command);
      assert.strictEqual(review.decision, "revise", command);
      assert.strictEqual(review.confidence, "very_high", command);
      assert.match(review.reason, /cwd argument/i, command);
    }
  });

  test("skips unrequested version probes without executing workspace-shadowable binaries", async () => {
    let completionRequests = 0;
    const review = await reviewCommandSafety({
      toolCall: createToolCall("dotnet --version && node --version && npm --version"),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "dangerous",
        warningMessage: "Unknown or unsupported shell syntax requires explicit confirmation.",
        reasonCode: "unsupported-syntax",
        workspaceContained: true,
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Create an ASP.NET and Astro application.",
      complete: async () => {
        completionRequests += 1;
        return createResponse('{"decision":"approve","confidence":"very_high","reason":"safe"}');
      },
    });

    assert.strictEqual(completionRequests, 0);
    assert.strictEqual(review.decision, "revise");
    assert.strictEqual(review.confidence, "very_high");
    assert.match(review.reason, /Skip unrequested prerequisite version checks/);
  });

  test("returns the strict model decision", async () => {
    let reviewPayload: Record<string, unknown> | undefined;
    const review = await reviewCommandSafety({
      toolCall: createToolCall("npm install"),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "Package manager command",
        reasonCode: "package-manager",
        workspaceContained: true,
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Create this application and install its dependencies.",
      workspaceRoot: "C:\\workspace",
      complete: async (_signal, request) => {
        const userMessage = request.messages.find((message) => message.role === "user");
        reviewPayload = JSON.parse(userMessage?.content || "{}") as Record<string, unknown>;
        return createResponse(
          '{"decision":"manual_confirmation","confidence":"medium","reason":"The install scripts are unknown."}',
        );
      },
    });

    assert.strictEqual(
      reviewPayload?.originalUserRequest,
      "Create this application and install its dependencies.",
    );
    assert.deepStrictEqual(review, {
      decision: "manual_confirmation",
      confidence: "medium",
      reason: "The install scripts are unknown.",
    });
  });

  test("reviews the normalized command with its resolved cwd instead of stale leading cd syntax", async () => {
    let reviewPayload: Record<string, unknown> | undefined;
    const review = await reviewCommandSafety({
      toolCall: createToolCall("cd frontend && npm install"),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "Package manager command",
        command: "npm install",
        cwd: "C:\\workspace\\frontend",
        workspaceRoot: "C:\\workspace",
        shell: "cmd.exe",
        reasonCode: "package-manager",
        workspaceContained: true,
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Create an Astro frontend and install its dependencies.",
      workspaceRoot: "C:\\workspace",
      complete: async (_signal, request) => {
        const userMessage = request.messages.find((message) => message.role === "user");
        reviewPayload = JSON.parse(userMessage?.content || "{}") as Record<string, unknown>;
        return createResponse(
          '{"decision":"approve","confidence":"very_high","reason":"The install is required and scoped to the frontend."}',
        );
      },
    });

    assert.strictEqual(reviewPayload?.command, "npm install");
    assert.strictEqual(reviewPayload?.cwd, "C:\\workspace\\frontend");
    assert.deepStrictEqual(reviewPayload?.scopeFacts, {
      cwdInsideWorkspace: true,
      cwdRelativeToWorkspace: "frontend",
      localAnalyzerFoundOnlyWorkspaceRelativePaths: true,
      relativeChildPathMeaning:
        "Relative child paths resolve inside the active workspace unless the command later changes to an external directory.",
    });
    assert.strictEqual(review.decision, "approve");
    assert.strictEqual(review.confidence, "very_high");
  });

  test("does not present neutral stderr capture as a scaffold risk", async () => {
    let reviewPayload: Record<string, unknown> | undefined;
    const command =
      "npm create astro@latest Frontend -- --template basics --no-git --yes 2>&1";
    const review = await reviewCommandSafety({
      toolCall: createToolCall(command),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "This command form is not in the read-only allowlist.",
        command,
        cwd: "C:\\workspace",
        workspaceRoot: "C:\\workspace",
        shell: "cmd.exe",
        reasonCode: "not-allowlisted",
        workspaceContained: true,
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Create an Astro frontend using npm create astro@latest.",
      workspaceRoot: "C:\\workspace",
      complete: async (_signal, request) => {
        const userMessage = request.messages.find((message) => message.role === "user");
        reviewPayload = JSON.parse(userMessage?.content || "{}") as Record<string, unknown>;
        return createResponse(
          '{"decision":"approve","confidence":"very_high","reason":"The requested scaffold is workspace scoped."}',
        );
      },
    });

    assert.strictEqual(
      reviewPayload?.command,
      "npm create astro@latest Frontend -- --template basics --no-git --yes",
    );
    assert.deepStrictEqual(
      (reviewPayload?.reviewHints as Record<string, unknown>)?.hasOutputRedirection,
      false,
    );
    assert.strictEqual(review.decision, "approve");
    assert.strictEqual(review.confidence, "very_high");
  });

  test("supplies bounded read-only context for explicitly affected workspace files", async () => {
    const requestedPaths: string[] = [];
    setToolWorkspaceHost({
      getRootPath: () => "C:\\workspace",
      readFile: async () => {
        throw new Error("Large previews must use the bounded reader.");
      },
      readFilePreview: async (filePath, maxBytes) => {
        requestedPaths.push(`${filePath}:${maxBytes}`);
        return {
          head: Buffer.from("<header>template</header>"),
          tail: Buffer.from("<footer>generated</footer>"),
          size: 20_000,
        };
      },
      writeFile: async () => undefined,
      stat: async () => ({ type: "file", size: 20_000 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    let reviewPayload: Record<string, unknown> | undefined;

    await reviewCommandSafety({
      toolCall: createToolCall("del /f Welcome.astro"),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: "This command deletes files.",
        command: "del /f Welcome.astro",
        cwd: "C:\\workspace\\Frontend\\src\\components",
        workspaceRoot: "C:\\workspace",
        shell: "cmd.exe",
        reasonCode: "delete",
        workspaceContained: true,
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Replace the generated starter component.",
      workspaceRoot: "C:\\workspace",
      complete: async (_signal, request) => {
        reviewPayload = JSON.parse(
          request.messages.find((message) => message.role === "user")?.content || "{}",
        ) as Record<string, unknown>;
        return createResponse(
          '{"decision":"approve","confidence":"medium_high","reason":"The named generated file is workspace scoped."}',
        );
      },
    });

    assert.deepStrictEqual(requestedPaths, ["Frontend/src/components/Welcome.astro:4096"]);
    assert.deepStrictEqual(reviewPayload?.workspaceFiles, [{
      path: "Frontend/src/components/Welcome.astro",
      size: 20_000,
      truncated: true,
      content: "<header>template</header>\n… omitted …\n<footer>generated</footer>",
    }]);
  });

  test("never reads sensitive or external file operands for remote review", async () => {
    const touchedPaths: string[] = [];
    setToolWorkspaceHost({
      getRootPath: () => "C:\\workspace",
      readFile: async (filePath) => {
        touchedPaths.push(filePath);
        return Buffer.from("secret");
      },
      writeFile: async () => undefined,
      stat: async (filePath) => {
        touchedPaths.push(filePath);
        return { type: "file", size: 6 };
      },
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    const payloads: Record<string, unknown>[] = [];

    for (const command of ["del /f .env", "del /f C:\\outside\\private.txt"]) {
      await reviewCommandSafety({
        toolCall: createToolCall(command),
        localAnalysis: {
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "This command deletes files.",
          command,
          cwd: "C:\\workspace",
          workspaceRoot: "C:\\workspace",
          shell: "cmd.exe",
          reasonCode: "delete",
          workspaceContained: false,
        },
        providerConfig: createProviderConfig(),
        workspaceRoot: "C:\\workspace",
        complete: async (_signal, request) => {
          payloads.push(JSON.parse(
            request.messages.find((message) => message.role === "user")?.content || "{}",
          ) as Record<string, unknown>);
          return createResponse(
            '{"decision":"manual_confirmation","confidence":"very_low","reason":"No safe file evidence is available."}',
          );
        },
      });
    }

    assert.deepStrictEqual(touchedPaths, []);
    assert.deepStrictEqual(payloads.map((payload) => payload.workspaceFiles), [[], []]);
  });

  test("replans ambiguous in-workspace scaffolding instead of asking for manual confirmation", async () => {
    let reviewPayload: Record<string, unknown> | undefined;
    const command = [
      "mkdir fullstack-time-tracker",
      "dotnet new webapi -n backend --no-https -o fullstack-time-tracker/backend",
      "npm create astro@latest frontend -- --template minimal --no-install --yes 2>&1 || cd fullstack-time-tracker",
      "npm create astro@latest frontend -- --template minimal --no-install 2>&1",
    ].join(" && ");
    const review = await reviewCommandSafety({
      toolCall: createToolCall(command),
      localAnalysis: {
        requiresConfirmation: true,
        dangerLevel: "dangerous",
        warningMessage: "Unknown or unsupported shell syntax requires explicit confirmation.",
        reasonCode: "unsupported-syntax",
        workspaceContained: true,
        cwd: "C:\\workspace",
        workspaceRoot: "C:\\workspace",
        shell: "cmd.exe",
      },
      providerConfig: createProviderConfig(),
      originalUserRequest: "Create a local ASP.NET and Astro time tracker with as few rounds as possible.",
      workspaceRoot: "C:\\workspace",
      complete: async (_signal, request) => {
        const userMessage = request.messages.find((message) => message.role === "user");
        reviewPayload = JSON.parse(userMessage?.content || "{}") as Record<string, unknown>;
        return createResponse(JSON.stringify({
          decision: "manual_confirmation",
          confidence: "medium",
          reason: "The new directory may be outside the workspace and the fallback is ambiguous.",
        }));
      },
    });

    assert.deepStrictEqual(reviewPayload?.scopeFacts, {
      cwdInsideWorkspace: true,
      cwdRelativeToWorkspace: ".",
      localAnalyzerFoundOnlyWorkspaceRelativePaths: true,
      relativeChildPathMeaning:
        "Relative child paths resolve inside the active workspace unless the command later changes to an external directory.",
    });
    assert.deepStrictEqual(reviewPayload?.reviewHints, {
      hasCompoundShellFlow: true,
      hasMixedConditionalFlow: true,
      hasOutputRedirection: false,
      saferReplanningAvailable:
        "The primary agent can issue separate finite tool calls with explicit cwd or workspace-relative paths.",
    });
    assert.strictEqual(review.decision, "revise");
    assert.strictEqual(review.confidence, "very_high");
    assert.match(review.reason, /separate finite commands/i);
    assert.match(review.reason, /destination paths or cwd/i);
  });
});

function createToolCall(command: string): ToolCall {
  return {
    id: "call-command-review",
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

function createResponse(content: string): ChatCompletionResponse {
  return {
    id: "review",
    object: "chat.completion",
    created: 0,
    model: "deepseek-chat",
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
    }],
  };
}
