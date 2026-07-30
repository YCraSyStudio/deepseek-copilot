import * as assert from "assert";
import { createSnapshotToolCallGroups, getVisibleActiveGroups } from "@/ui/hooks/chat/UseToolCallController";

suite("tool call snapshot restoration", () => {
  test("rebuilds pending confirmation groups after the webview is recreated", () => {
    const groups = createSnapshotToolCallGroups({
      toolCalls: [{
        toolCallId: "terminal-1",
        toolName: "run_terminal_command",
        arguments: "{\"command\":\"git status\"}",
        round: 3,
        status: "awaiting_confirmation",
        requiresConfirmation: true,
        dangerConfirmation: {
          requiresConfirmation: true,
          dangerLevel: "caution",
          warningMessage: "Review this command",
          command: "git status",
          canTrustForSession: true,
        },
      }],
    });

    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].round, 3);
    assert.strictEqual(groups[0].toolCalls[0].status, "awaiting_confirmation");
    assert.strictEqual(groups[0].toolCalls[0].requiresConfirmation, true);
    assert.strictEqual(groups[0].toolCalls[0].dangerConfirmation?.command, "git status");

    const visible = getVisibleActiveGroups([{
      id: "active-assistant",
      role: "assistant",
      content: "",
      toolCalls: [{
        toolCallId: "terminal-1",
        toolName: "run_terminal_command",
        arguments: "{\"command\":\"git status\"}",
        round: 3,
        status: "awaiting_confirmation",
        requiresConfirmation: true,
      }],
    }], groups);
    assert.strictEqual(visible[0].toolCalls[0].toolCallId, "terminal-1");
  });
});
