import * as assert from "assert";
import { isConversation } from "@/core/chat/ConversationValidation";

suite("history validation", () => {
  test("accepts native timeline history and rejects malformed persisted data", () => {
    const conversation = {
      id: "conversation-1",
      title: "Test",
      createdAt: 1,
      updatedAt: 2,
      model: "model",
      workspaceUri: "file:///workspace",
      messages: [
        { id: "user-1", role: "user", content: "hello" },
        {
          id: "assistant-1",
          role: "assistant",
          content: "done",
          timeline: [
            { id: "reasoning-1", type: "reasoning", content: "think" },
            { id: "tool-1", type: "tool-group", round: 1, toolCallIds: ["call-1"] },
            { id: "content-1", type: "content", content: "done" },
          ],
        },
      ],
    };

    assert.strictEqual(isConversation(conversation), true);
    assert.strictEqual(isConversation({ ...conversation, schemaVersion: 2 }), true);
    assert.strictEqual(isConversation({ ...conversation, schemaVersion: 3 }), false);
    assert.strictEqual(isConversation({ ...conversation, messages: [{ id: "x", role: "root", content: "bad" }] }), false);
    assert.strictEqual(isConversation({ ...conversation, messages: [{ id: "x", role: "assistant", content: "", timeline: [{ id: "x", type: "tool-group", round: 0, toolCallIds: [] }] }] }), false);
  });
});
