import * as assert from "assert";
import type { AssistantTimelineEvent, Conversation } from "@/adapters";
import { ConversationState } from "@/core/chat/ConversationState";

suite("ConversationState", () => {
  test("appends multiple turns to one conversation until explicitly reset", async () => {
    const saves: Conversation[] = [];
    const state = new ConversationState({ save: async (conversation) => {saves.push(structuredClone(conversation));} });

    await state.saveTurn({
      userMessage: state.createMessage("user", "First"),
      assistantMessage: state.createMessage("assistant", "One"),
      model: "test-model",
    });
    const firstId = state.getActiveConversationId();
    await state.saveTurn({
      userMessage: state.createMessage("user", "Second"),
      assistantMessage: state.createMessage("assistant", "Two"),
      model: "test-model",
    });

    assert.strictEqual(saves.length, 2);
    assert.strictEqual(saves[1].id, firstId);
    assert.strictEqual(saves[1].messages.length, 4);

    state.reset();
    await state.saveTurn({
      userMessage: state.createMessage("user", "New chat"),
      assistantMessage: state.createMessage("assistant", "Separate"),
      model: "test-model",
    });
    assert.notStrictEqual(state.getActiveConversationId(), firstId);
  });

  test("persists timeline events and derives API reasoning without control markers", async () => {
    let saved: Conversation | undefined;
    const state = new ConversationState({
      save: async (conversation) => {
        saved = conversation;
      },
    });
    const timeline: AssistantTimelineEvent[] = [
      { id: "reasoning-1", type: "reasoning", content: "Inspect workspace. " },
      { id: "tools-1", type: "tool-group", round: 1, toolCallIds: ["call-1"] },
      { id: "reasoning-2", type: "reasoning", content: "Use the result." },
      { id: "content-1", type: "content", content: "Done." },
    ];

    const userMessage = state.createMessage("user", "Do it");
    const assistantMessage = state.createMessage("assistant", "Done.", {
      timeline,
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "list_directory",
          arguments: "{}",
          result: "listed: .",
          round: 1,
          status: "completed",
        },
      ],
    });

    await state.saveTurn({ userMessage, assistantMessage, model: "test-model" });

    assert.deepStrictEqual(saved?.messages[1].timeline, timeline);
    const apiMessages = state.getApiMessages();
    assert.strictEqual(apiMessages[1].reasoning_content, "Inspect workspace. Use the result.");
    assert.strictEqual(apiMessages[1].content, "Done.");
    assert.strictEqual(apiMessages[1].content?.includes("YDSC_TOOL_ROUND"), false);
    assert.strictEqual(state.forget("another-conversation"), false);
    assert.strictEqual(state.forget(saved!.id), true);
    assert.deepStrictEqual(state.getApiMessages(), []);
  });

  test("keeps interrupted visible content but omits incomplete reasoning and tools from API context", async () => {
    const state = new ConversationState({ save: async () => undefined });
    state.load({
      schemaVersion: 2,
      id: "conversation",
      title: "Interrupted",
      createdAt: 1,
      updatedAt: 1,
      model: "model",
      workspaceUri: "file:///workspace",
      messages: [{
        id: "assistant",
        role: "assistant",
        content: "partial answer",
        generationStatus: "interrupted",
        timeline: [{ id: "reasoning", type: "reasoning", content: "private partial reasoning" }],
        toolCalls: [{
          toolCallId: "call",
          toolName: "read_file",
          arguments: "{}",
          status: "cancelled",
          result: "cancelled",
        }],
      }],
    });

    assert.deepStrictEqual(state.getApiMessages(), [{ role: "assistant", content: "partial answer" }]);
  });
});
