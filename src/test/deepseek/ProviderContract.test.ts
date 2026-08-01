import * as assert from "assert";
import type { ToolDefinition } from "@/adapters";
import { DEFAULT_CONFIG } from "@/adapters/Config";
import { DeepSeekProvider, assertCompatibleModel } from "@/deepseekApi/providers/deepseek/DeepSeekProvider";
import { buildChatBody } from "@/deepseekApi/providers/deepseek/features/Chat";

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

  test("does not send beta-only strict fields through the stable endpoint", () => {
    const body = buildChatBody({ tools: [tool] }, DEFAULT_CONFIG);
    assert.strictEqual(body.tools?.[0].function.strict, undefined);
    assert.strictEqual(JSON.stringify(body).includes('"strict"'), false);
  });

  test("restricts official DeepSeek model IDs but permits compatible custom providers", () => {
    assert.doesNotThrow(() => assertCompatibleModel("deepseek-v4-flash", "https://api.deepseek.com"));
    assert.throws(() => assertCompatibleModel("custom-model", "https://api.deepseek.com"), /not supported/);
    assert.doesNotThrow(() => assertCompatibleModel("custom-model", "http://127.0.0.1:11434/v1"));
  });

  test("connection checks use the same official-model compatibility policy", async () => {
    const provider = new DeepSeekProvider({ ...DEFAULT_CONFIG, apiKey: "unused", model: "custom-model", baseUrl: "https://api.deepseek.com" });
    assert.deepStrictEqual(await provider.testConnection(), {
      success: false,
      error: 'Model "custom-model" is not supported by the official DeepSeek API configuration.',
    });
  });
});
