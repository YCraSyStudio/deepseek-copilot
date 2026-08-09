import * as assert from "node:assert";
import type { HandlerToWebviewMessage } from "@/contracts";
import { acceptMessageForScope } from "@webview/views/chatView/hooks/GenerationEventScope";

suite("generation event scope", () => {
  const lateMessage: HandlerToWebviewMessage = {
    type: "addMessage",
    conversationId: "conversation-a",
    generationId: "generation-a",
    message: {
      role: "assistant",
      content: "late content",
      generationId: "generation-a",
    },
  };

  test("rejects events from a cancelled chat while a new blank chat is selected", () => {
    assert.strictEqual(acceptMessageForScope(lateMessage, {}), false);
  });

  test("rejects another conversation and another generation", () => {
    assert.strictEqual(acceptMessageForScope(lateMessage, {
      conversationId: "conversation-b",
      activeGenerationId: "generation-b",
    }), false);
    assert.strictEqual(acceptMessageForScope(lateMessage, {
      conversationId: "conversation-a",
      activeGenerationId: "generation-b",
    }), false);
  });

  test("accepts only the selected generation and allows global snapshots", () => {
    assert.strictEqual(acceptMessageForScope(lateMessage, {
      conversationId: "conversation-a",
      activeGenerationId: "generation-a",
    }), true);
    assert.strictEqual(acceptMessageForScope({
      type: "generationSnapshot",
      generations: [],
      recoveredDrafts: [],
    }, {}), true);
  });
});
