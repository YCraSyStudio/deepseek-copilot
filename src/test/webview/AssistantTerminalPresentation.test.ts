import * as assert from "node:assert";
import { shouldShowGenerationTerminalStatus } from "@/ui/components/chatView/messages/GenerationTerminalPresentation";

suite("assistant terminal presentation", () => {
  test("hides only the internal steering boundary", () => {
    assert.strictEqual(shouldShowGenerationTerminalStatus("interrupted", "steered"), false);
    assert.strictEqual(shouldShowGenerationTerminalStatus("interrupted", "shutdown"), true);
    assert.strictEqual(shouldShowGenerationTerminalStatus("cancelled", "user_cancelled"), true);
    assert.strictEqual(shouldShowGenerationTerminalStatus("completed", undefined), false);
  });
});
