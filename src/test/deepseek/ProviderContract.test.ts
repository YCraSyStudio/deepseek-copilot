import * as assert from "assert";
import type { ToolDefinition } from "@/contracts";
import { DEFAULT_CONFIG } from "@/contracts/Config";
import { DeepSeekModelProvider, assertCompatibleModel } from "@/infrastructure/deepseek/providers/deepseek/DeepSeekProvider";
import { buildChatBody } from "@/infrastructure/deepseek/providers/deepseek/features/Chat";
import { buildToolCallRequest } from "@/infrastructure/deepseek/providers/deepseek/features/toolCall/ToolCallRequest";

suite("DeepSeek provider contract", () => {
  const tool: ToolDefinition = {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file",
      strict: true,
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  };

  test("keeps tools in thinking and non-thinking requests", () => {
    const thinking = buildChatBody({ tools: [tool] }, { ...DEFAULT_CONFIG, thinkingMode: true });
    const nonThinking = buildChatBody({ tools: [tool] }, { ...DEFAULT_CONFIG, thinkingMode: false });

    assert.strictEqual(thinking.tools?.length, 1);
    assert.strictEqual(nonThinking.tools?.length, 1);
    assert.strictEqual(thinking.thinking?.type, "enabled");
    assert.strictEqual(nonThinking.thinking?.type, "disabled");
  });

  test("keeps non-thinking mode disabled throughout tool-call rounds", () => {
    const request = buildToolCallRequest({
      model: "deepseek-v4-flash-vision-exp",
      messages: [{ role: "user", content: "Read the file" }],
      tools: [tool],
      stream: true,
      cycleOptions: { thinkingMode: false },
    });

    assert.strictEqual(request.thinking?.type, "disabled");
    assert.strictEqual(request.reasoning_effort, undefined);
    assert.strictEqual(request.tools?.length, 1);
  });

  test("does not send beta-only strict fields through the stable endpoint", () => {
    const body = buildChatBody({ tools: [tool] }, DEFAULT_CONFIG);
    assert.strictEqual(body.tools?.[0].function.strict, undefined);
    assert.strictEqual(JSON.stringify(body).includes('"strict"'), false);
  });

  test("restricts official DeepSeek model IDs but permits compatible custom providers", () => {
    assert.doesNotThrow(() => assertCompatibleModel("deepseek-v4-flash-vision-exp", "https://api.deepseek.com"));
    assert.doesNotThrow(() => assertCompatibleModel("deepseek-v4-flash", "https://api.deepseek.com"));
    assert.throws(() => assertCompatibleModel("custom-model", "https://api.deepseek.com"), /not supported/);
    assert.doesNotThrow(() => assertCompatibleModel("custom-model", "http://127.0.0.1:11434/v1"));
  });

  test("connection checks use the same official-model compatibility policy", async () => {
    const provider = new DeepSeekModelProvider({ ...DEFAULT_CONFIG, apiKey: "unused", model: "custom-model", baseUrl: "https://api.deepseek.com" });
    assert.deepStrictEqual(await provider.testConnection(), {
      success: false,
      error: 'Model "custom-model" is not supported by the official DeepSeek API configuration.',
    });
  });

  test("falls back from unavailable Vision to stable Flash for text requests", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: Array<Record<string, unknown>> = [];
    try {
      globalThis.fetch = async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (bodies.length === 1) {
          return Response.json({ error: { type: "invalid_request_error", message: "Model Not Exist" } }, { status: 400 });
        }
        return Response.json({
          id: "fallback-response",
          object: "chat.completion",
          created: 1,
          model: "deepseek-v4-flash",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        });
      };
      const provider = new DeepSeekModelProvider({ ...DEFAULT_CONFIG, apiKey: "test-key" });
      const response = await provider.chatCompletion({
        model: "deepseek-v4-flash-vision-exp",
        messages: [{ role: "user", content: "hello" }],
      });
      assert.strictEqual(response.model, "deepseek-v4-flash");
      assert.deepStrictEqual(bodies.map((body) => body.model), ["deepseek-v4-flash-vision-exp", "deepseek-v4-flash"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("stream fallback strips image blocks and discloses the visual limitation", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: Array<Record<string, unknown>> = [];
    const chunks: string[] = [];
    try {
      globalThis.fetch = async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (bodies.length === 1) {
          return Response.json({ error: { message: "not found" } }, { status: 404 });
        }
        return new Response([
          'data: {"choices":[{"delta":{"content":"fallback"},"finish_reason":null}]}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"), { status: 200, headers: { "content-type": "text/event-stream" } });
      };
      const provider = new DeepSeekModelProvider({ ...DEFAULT_CONFIG, apiKey: "test-key" });
      await provider.chatCompletionStream({
        model: "deepseek-v4-flash-vision-exp",
        messages: [{ role: "user", content: [{ type: "text", text: "describe" }, { type: "file", file_id: "file-test123" }] }],
        stream: true,
      }, (chunk) => {
        if (chunk.type === "content") {chunks.push(chunk.content ?? "");}
      });
      assert.deepStrictEqual(bodies.map((body) => body.model), ["deepseek-v4-flash-vision-exp", "deepseek-v4-flash"]);
      assert.strictEqual(JSON.stringify(bodies[1]).includes('"type":"file"'), false);
      assert.match(JSON.stringify(bodies[1]), /vision_fallback/);
      assert.deepStrictEqual(chunks, ["fallback"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not turn a non-stream image analysis into a false Flash result", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ error: { message: "model removed" } }, { status: 410 });
      };
      const provider = new DeepSeekModelProvider({ ...DEFAULT_CONFIG, apiKey: "test-key" });
      await assert.rejects(provider.chatCompletion({
        model: "deepseek-v4-flash-vision-exp",
        messages: [{ role: "user", content: [{ type: "text", text: "describe" }, { type: "file", file_id: "file-test123" }] }],
      }), /images could not be analyzed/);
      assert.strictEqual(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not fallback for authentication failures", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls += 1;
        return Response.json({ error: { code: "invalid_api_key" } }, { status: 401 });
      };
      const provider = new DeepSeekModelProvider({ ...DEFAULT_CONFIG, apiKey: "bad-key" });
      await assert.rejects(provider.chatCompletion({
        model: "deepseek-v4-flash-vision-exp",
        messages: [{ role: "user", content: "hello" }],
      }), /Invalid API credentials/);
      assert.strictEqual(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("does not apply the official Vision fallback policy to custom endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const models: string[] = [];
    try {
      globalThis.fetch = async (_input, init) => {
        models.push((JSON.parse(String(init?.body)) as { model: string }).model);
        return Response.json({ error: { code: "model_not_found", param: "model", message: "Model is not available" } }, { status: 400 });
      };
      const provider = new DeepSeekModelProvider({
        ...DEFAULT_CONFIG,
        apiKey: "test-key",
        baseUrl: "http://127.0.0.1:11434/v1",
      });
      await assert.rejects(provider.chatCompletion({
        model: "deepseek-v4-flash-vision-exp",
        messages: [{ role: "user", content: "hello" }],
      }));
      assert.deepStrictEqual(models, ["deepseek-v4-flash-vision-exp"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
