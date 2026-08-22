import * as assert from "assert";
import type { ChatCompletionResponse, ChatMessage } from "@/contracts";
import { requestToolRoundLimitDecision, runToolCallCycle } from "@/application/chat/toolCall/ToolCallCycle";

suite("tool call round limit", () => {
  test("continues the same cycle when the user grants another batch", async () => {
    let received: [number, number, number, number] | undefined;
    const decision = await requestToolRoundLimitDecision((rounds, batchSize, completedToolCalls, toolCallBudget) => {
      received = [rounds, batchSize, completedToolCalls, toolCallBudget];
      return "continue";
    }, 6, 6, 24, 24);

    assert.strictEqual(decision, "continue");
    assert.deepStrictEqual(received, [6, 6, 24, 24]);
  });

  test("stops by default and honors an explicit stop decision", async () => {
    assert.strictEqual(await requestToolRoundLimitDecision(undefined, 6, 6), "stop");
    assert.strictEqual(await requestToolRoundLimitDecision(() => "stop", 12, 6), "stop");
  });

  test("honors an explicit continuation decision for limited cycles", async () => {
    assert.strictEqual(await requestToolRoundLimitDecision(() => "continue", 6, 6, 24, 24), "continue");
  });

  test("does not cap rounds or tool calls when limits are disabled", async () => {
    const responses = [toolResponse("call-1", "README.md"), toolResponse("call-2", "CHANGELOG.md"), finalResponse];
    let executed = 0;
    let limitRequests = 0;

    const result = await runToolCallCycle({
      initialMessages: [{ role: "user", content: "read both files" }],
      tools: [toolDefinition],
      model: "model",
      modelClient: {
        completeRound: async () => responses.shift()!,
        streamRound: async () => responses.shift()!,
      },
      executeToolCall: async () => {
        executed++;
        return "contents";
      },
      cycleOptions: {
        maxRounds: 1,
        maxToolCallsPerBatch: 1,
        shouldEnforceToolCallLimits: () => false,
        onLimitReached: () => {
          limitRequests++;
          return "stop";
        },
      },
    });

    assert.strictEqual(result.toolCallsExecuted, 2);
    assert.strictEqual(executed, 2);
    assert.strictEqual(limitRequests, 0);
  });

  test("never executes tool fragments from a length-truncated response", async () => {
    let executed = false;
    await assert.rejects(runToolCallCycle({
      initialMessages: [{ role: "user", content: "read" }],
      tools: [toolDefinition],
      model: "model",
      modelClient: {
        completeRound: async () => truncatedToolResponse,
        streamRound: async () => truncatedToolResponse,
      },
      executeToolCall: async () => {
        executed = true;
        return "should not run";
      },
    }), /output limit.*No truncated tool was executed/);
    assert.strictEqual(executed, false);
  });

  test("retries once when a stopped response only announces a future action", async () => {
    const responses = [stalledResponse, finalResponse];
    const requests: ChatMessage[][] = [];
    const streamed: string[] = [];

    const result = await runToolCallCycle({
      initialMessages: [{ role: "user", content: "busca la versión absoluta" }],
      tools: [toolDefinition],
      model: "model",
      modelClient: {
        completeRound: async ({ messages }) => {
          requests.push(messages);
          return responses.shift()!;
        },
        streamRound: async () => {throw new Error("unexpected streaming round");},
      },
      executeToolCall: async () => "unused",
      cycleOptions: { onStreamChunk: (content) => streamed.push(content) },
    });

    assert.strictEqual(requests.length, 2);
    assert.match(String(requests[1][0]?.content ?? ""), /completion_recovery/);
    assert.deepStrictEqual(streamed, ["\n\n"]);
    assert.strictEqual(result.finalMessage.content, "done");
    assert.strictEqual(result.rounds, 2);
  });

  test("does not loop when the recovery response also only announces an action", async () => {
    let requests = 0;
    const result = await runToolCallCycle({
      initialMessages: [{ role: "user", content: "search" }],
      tools: [toolDefinition],
      model: "model",
      modelClient: {
        completeRound: async () => {
          requests++;
          return stalledResponse;
        },
        streamRound: async () => {throw new Error("unexpected streaming round");},
      },
      executeToolCall: async () => "unused",
    });

    assert.strictEqual(requests, 2);
    assert.strictEqual(result.finalMessage.content, stalledResponse.choices[0].message.content);
  });
});

const toolDefinition = {
  type: "function" as const,
  function: {
    name: "read_file",
    description: "Read a file",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
};

const truncatedToolResponse: ChatCompletionResponse = {
  id: "response",
  object: "chat.completion",
  created: 1,
  model: "model",
  choices: [{
    index: 0,
    finish_reason: "length",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call-1",
        type: "function",
        function: { name: "read_file", arguments: '{"path":"README.md"' },
      }],
    },
  }],
};

function toolResponse(id: string, path: string): ChatCompletionResponse {
  return {
    id: `response-${id}`,
    object: "chat.completion",
    created: 1,
    model: "model",
    choices: [{
      index: 0,
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id,
          type: "function",
          function: { name: "read_file", arguments: JSON.stringify({ path }) },
        }],
      },
    }],
  };
}

const finalResponse: ChatCompletionResponse = {
  id: "response-final",
  object: "chat.completion",
  created: 1,
  model: "model",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "done" } }],
};

const stalledResponse: ChatCompletionResponse = {
  id: "response-stalled",
  object: "chat.completion",
  created: 1,
  model: "model",
  choices: [{
    index: 0,
    finish_reason: "stop",
    message: {
      role: "assistant",
      content: "I need to clarify the absolute latest version. Let me check.",
    },
  }],
};
