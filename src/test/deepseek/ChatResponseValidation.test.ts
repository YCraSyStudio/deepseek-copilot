import * as assert from "assert";
import { parseChatCompletionResponse, parseStreamToolCalls } from "@/deepseekApi/providers/deepseek/features/ChatResponseValidation";

suite("DeepSeek chat response validation", () => {
  test("accepts a complete response", () => {
    const response = parseChatCompletionResponse({
      id: "response-1",
      object: "chat.completion",
      created: 1,
      model: "model",
      choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
    });
    assert.strictEqual(response.choices[0].message.content, "done");
  });

  test("rejects malformed choices and tool calls", () => {
    assert.throws(
      () => parseChatCompletionResponse({ id: "x", object: "chat.completion", created: 1, model: "m", choices: [] }),
      /invalid chat completion response/,
    );
    assert.throws(
      () =>
        parseChatCompletionResponse({
          id: "x",
          object: "chat.completion",
          created: 1,
          model: "m",
          choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: 1 }] }, finish_reason: "tool_calls" }],
        }),
      /invalid chat completion choice/,
    );
  });

  test("normalizes valid streamed tool deltas and rejects malformed ones", () => {
    assert.deepStrictEqual(parseStreamToolCalls([{ index: 0, id: "call-1", function: { name: "read_file", arguments: "{}" } }])[0], {
      id: "call-1",
      type: "function",
      function: { name: "read_file", arguments: "{}" },
      index: 0,
    });
    assert.throws(() => parseStreamToolCalls([{ function: { arguments: 42 } }]), /invalid streamed tool arguments/);
  });

});
