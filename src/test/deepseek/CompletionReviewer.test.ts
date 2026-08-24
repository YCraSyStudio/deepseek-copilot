import * as assert from "node:assert";
import type { AppConfig, ChatCompletionRequest, ChatCompletionResponse } from "@/contracts";
import {
  parseCompletionReview,
  reviewCompletion,
} from "@/infrastructure/deepseek/providers/deepseek/features/CompletionReviewer";

suite("DeepSeek completion reviewer", () => {
  test("accepts only the bounded completion decision schema", () => {
    assert.strictEqual(parseCompletionReview('{"decision":"complete","reason":"The result was delivered."}'), "complete");
    assert.strictEqual(parseCompletionReview('```json\n{"decision":"incomplete","reason":"Another action was announced."}\n```'), "incomplete");
    assert.strictEqual(parseCompletionReview('{"decision":"complete","reason":"ok","extra":true}'), "unknown");
    assert.strictEqual(parseCompletionReview("not json"), "unknown");
  });

  test("uses a separate tool-free request to classify multilingual output", async () => {
    let captured: ChatCompletionRequest | undefined;
    const decision = await reviewCompletion({
      messages: [
        { role: "system", content: "agent" },
        { role: "user", content: "Crea la aplicación" },
        { role: "assistant", content: null, tool_calls: [{
          id: "call-1",
          type: "function",
          function: { name: "create_file", arguments: '{"path":"src/App.ts"}' },
        }] },
        { role: "tool", name: "create_file", tool_call_id: "call-1", content: "created" },
      ],
      candidate: { role: "assistant", content: "现在我会运行测试。" },
      toolCallsExecuted: 1,
      recoveryAttempted: false,
      providerConfig: config(),
      complete: async (_signal, request) => {
        captured = request;
        return response({ decision: "incomplete", reason: "The candidate announces another required action." });
      },
    });

    assert.strictEqual(decision, "incomplete");
    assert.deepStrictEqual(captured?.thinking, { type: "disabled" });
    assert.strictEqual(captured?.tool_choice, "none");
    assert.strictEqual(captured?.temperature, 0);
    assert.match(String(captured?.messages[1]?.content), /Crea la aplicación/);
    assert.match(String(captured?.messages[1]?.content), /现在我会运行测试/);
  });

  test("falls back to the provider stop signal when the review is invalid", async () => {
    const decision = await reviewCompletion({
      messages: [{ role: "user", content: "answer" }],
      candidate: { role: "assistant", content: "answer" },
      toolCallsExecuted: 0,
      recoveryAttempted: false,
      providerConfig: config(),
      complete: async () => responseText("invalid"),
    });

    assert.strictEqual(decision, "unknown");
  });
});

function config(): AppConfig {
  return {
    model: "deepseek-chat",
    apiKey: "test",
    baseUrl: "https://api.deepseek.com",
  } as AppConfig;
}

function response(value: Record<string, unknown>): ChatCompletionResponse {
  return responseText(JSON.stringify(value));
}

function responseText(content: string): ChatCompletionResponse {
  return {
    id: "review",
    object: "chat.completion",
    created: 0,
    model: "deepseek-chat",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}
