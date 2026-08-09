import * as assert from "assert";
import { requestToolRoundLimitDecision } from "@/deepseekApi/providers/deepseek/features/toolCall/ToolCallCycle";

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

  test("requires an explicit continuation decision for unattended cycles", async () => {
    assert.strictEqual(await requestToolRoundLimitDecision(() => "continue", 6, 6, 24, 24), "continue");
  });
});
