import * as assert from "assert";
import type { AssistantTimelineEvent, Conversation } from "@/adapters";
import { ConversationState } from "@/core/chat/ConversationState";
import { createProviderTranscript } from "@/core/chat/ProviderTranscript";

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

  test("persists timeline events but does not synthesize provider reasoning for legacy turns", async () => {
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
    assert.strictEqual(apiMessages[1].reasoning_content, undefined);
    assert.strictEqual(apiMessages[1].content, "Done.");
    assert.strictEqual(apiMessages[1].content?.includes("YDSC_TOOL_ROUND"), false);
    assert.strictEqual(state.forget("another-conversation"), false);
    assert.strictEqual(state.forget(saved!.id), true);
    assert.deepStrictEqual(state.getApiMessages(), []);
  });

  test("replays a complete canonical provider transcript as one atomic generation", async () => {
    const state = new ConversationState({ save: async () => undefined });
    const transcript = createProviderTranscript([
      {
        role: "assistant",
        content: null,
        reasoning_content: "Need the file.",
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"src/a.ts\"}" },
        }],
      },
      { role: "tool", tool_call_id: "call-1", name: "read_file", content: "literal result" },
      { role: "assistant", content: "Done.", reasoning_content: "Use result." },
    ], "complete");
    state.load({
      schemaVersion: 2,
      id: "conversation",
      title: "Canonical",
      createdAt: 1,
      updatedAt: 1,
      model: "deepseek-v4-flash",
      workspaceUri: "file:///workspace",
      messages: [
        {
          id: "user",
          role: "user",
          content: "Read it",
          createdAt: 1,
          generationId: "generation-1",
        },
        {
          id: "assistant",
          role: "assistant",
          content: "Done.",
          createdAt: 2,
          generationId: "generation-1",
          generationStatus: "completed",
          providerTranscript: transcript,
        },
      ],
    });

    const units = state.getApiContextUnits();
    assert.strictEqual(units.length, 1);
    assert.strictEqual(units[0].generationId, "generation-1");
    assert.deepStrictEqual(units[0].messages, [
      { role: "user", content: "Read it" },
      ...transcript.messages,
    ]);
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
