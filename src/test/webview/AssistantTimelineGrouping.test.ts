import * as assert from "node:assert";
import type { AssistantTimelineEvent } from "@/contracts";
import {
  groupAssistantTimeline,
  summarizeActivity,
} from "@webview/components/chatView/tools/timeline/AssistantTimelineGrouping";
import type { ToolCallGroup } from "@webview/views/chatView/ChatViewTypes";

suite("assistant activity grouping", () => {
  test("groups consecutive reasoning and tools while preserving text boundaries", () => {
    const timeline: AssistantTimelineEvent[] = [
      { id: "reason-1", type: "reasoning", content: "Inspect." },
      { id: "tools-1", type: "tool-group", round: 1, toolCallIds: ["call-1", "call-2"] },
      { id: "reason-2", type: "reasoning", content: "Apply result." },
      { id: "content-1", type: "content", content: "Backend complete." },
      { id: "tools-2", type: "tool-group", round: 2, toolCallIds: ["call-3"] },
    ];

    const blocks = groupAssistantTimeline(timeline);

    assert.deepStrictEqual(blocks.map((block) => block.type), ["activity", "content", "activity"]);
    assert.strictEqual(blocks[0]?.type === "activity" && blocks[0].events.length, 3);
    assert.strictEqual(blocks[1]?.type === "content" && blocks[1].content, "Backend complete.");
  });

  test("summarizes steps and exposes an active tool state", () => {
    const timeline: AssistantTimelineEvent[] = [
      { id: "reason-1", type: "reasoning", content: "Inspect." },
      { id: "tools-1", type: "tool-group", round: 1, toolCallIds: ["call-1", "call-2"] },
    ];
    const activity = groupAssistantTimeline(timeline)[0];
    assert.ok(activity?.type === "activity");
    const groups: ToolCallGroup[] = [{
      id: "round-1",
      round: 1,
      expanded: false,
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "read_file",
          arguments: "{}",
          status: "completed",
          round: 1,
        },
        {
          toolCallId: "call-2",
          toolName: "list_directory",
          arguments: "{}",
          status: "running",
          round: 1,
        },
      ],
    }];

    assert.deepStrictEqual(summarizeActivity(activity.events, groups), {
      stepCount: 3,
      status: "running",
    });
  });

  test("uses the latest completed state after an earlier recovered failure", () => {
    const timeline: AssistantTimelineEvent[] = [
      { id: "tools-1", type: "tool-group", round: 1, toolCallIds: ["call-1"] },
      { id: "tools-2", type: "tool-group", round: 2, toolCallIds: ["call-2"] },
    ];
    const activity = groupAssistantTimeline(timeline)[0];
    assert.ok(activity?.type === "activity");
    const groups: ToolCallGroup[] = [
      createGroup(1, "call-1", "error"),
      createGroup(2, "call-2", "completed"),
    ];

    assert.strictEqual(summarizeActivity(activity.events, groups).status, "completed");
  });

  test("uses the recovery fallback when a restored timeline has no tool snapshot", () => {
    const timeline: AssistantTimelineEvent[] = [
      { id: "tools-1", type: "tool-group", round: 1, toolCallIds: ["call-1"] },
    ];
    const activity = groupAssistantTimeline(timeline)[0];
    assert.ok(activity?.type === "activity");

    assert.strictEqual(summarizeActivity(activity.events, [], "cancelled").status, "cancelled");
  });
});

function createGroup(
  round: number,
  toolCallId: string,
  status: "completed" | "error",
): ToolCallGroup {
  return {
    id: `round-${round}`,
    round,
    expanded: false,
    toolCalls: [{
      toolCallId,
      toolName: "read_file",
      arguments: "{}",
      status,
      round,
    }],
  };
}
