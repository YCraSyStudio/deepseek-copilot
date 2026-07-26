import * as assert from "assert";
import type { AppConfig, ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from "@/adapters";
import { ContextCompactor } from "@/core/context/ContextCompaction";
import {
  assertRequestFitsContext,
  estimateRequestTokens,
  getContextBudget,
} from "@/core/context/ContextBudget";
import { BaseProvider } from "@/deepseekApi";

suite("Context budget and compaction", () => {
  test("reserves model output and a safety margin while counting tool schemas", () => {
    const budget = getContextBudget("deepseek-v4-flash", 8_192);
    assert.strictEqual(budget.contextTokens, 1_000_000);
    assert.strictEqual(budget.safetyMarginTokens, 20_000);
    assert.strictEqual(budget.inputTokens, 971_808);

    const messages = [{ role: "user" as const, content: "hello" }];
    const withoutTools = estimateRequestTokens(messages);
    const withTools = estimateRequestTokens(messages, [{
      type: "function",
      function: { name: "read_file", parameters: { type: "object", properties: { path: { type: "string" } } } },
    }]);
    assert.ok(withTools > withoutTools);
    assert.doesNotThrow(() => assertRequestFitsContext(messages, [], "deepseek-v4-flash", 8_192));
  });

  test("uses DeepSeek with thinking and tools disabled and extracts literal selected ranges", async () => {
    const provider = new StubProvider();
    const lines = Array.from({ length: 500 }, (_, index) => `literal line ${index + 1}`);
    const compactor = new ContextCompactor(provider, "deepseek-v4-flash", new AbortController().signal);
    const [file] = await compactor.compactFiles([{
      path: "src/large.ts",
      type: "file",
      content: lines.join("\n"),
    }], "inspect the relevant code");

    assert.strictEqual(provider.requests.length, 1);
    assert.deepStrictEqual(provider.requests[0].thinking, { type: "disabled" });
    assert.strictEqual(provider.requests[0].tool_choice, "none");
    assert.strictEqual(provider.requests[0].max_tokens, 4096);
    assert.ok(file.content?.includes("literal line 10"));
    assert.ok(file.content?.includes("literal line 12"));
    assert.ok(!file.content?.includes("literal line 100"));
  });
});

class StubProvider extends BaseProvider {
  readonly name = "stub";
  readonly id = "stub";
  readonly requests: ChatCompletionRequest[] = [];

  constructor() {
    super({} as AppConfig);
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.requests.push(request);
    return {
      id: "response",
      object: "chat.completion",
      created: 1,
      model: request.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: "{\"ranges\":[{\"start\":10,\"end\":12}]}" },
        finish_reason: "stop",
      }],
    };
  }

  async chatCompletionStream(
    _request: ChatCompletionRequest,
    _onChunk: (chunk: StreamChunk) => void,
  ): Promise<void> {}

  async testConnection(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    return [];
  }
}
