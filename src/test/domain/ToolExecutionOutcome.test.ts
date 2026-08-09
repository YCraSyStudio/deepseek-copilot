import * as assert from "node:assert";
import {
  isFailedToolExecutionOutcome,
  serializeToolExecutionOutcome,
  type ToolExecutionOutcome,
} from "@/domain/tools/ToolExecutionOutcome";

suite("tool execution outcomes", () => {
  test("keeps protocol serialization at the boundary", () => {
    const outcome: ToolExecutionOutcome = { kind: "completed", content: "ok" };
    assert.strictEqual(serializeToolExecutionOutcome(outcome), "ok");
    assert.strictEqual(isFailedToolExecutionOutcome(outcome), false);
  });
});
