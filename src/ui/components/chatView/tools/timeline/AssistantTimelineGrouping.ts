import type { AssistantTimelineEvent } from "@/contracts";
import type { ToolCallGroup, ToolCallStatus } from "@webview/views/chatView/ChatViewTypes";

type ActivityEvent = Exclude<AssistantTimelineEvent, { type: "content" }>;

export type AssistantTimelineBlock =
  | Extract<AssistantTimelineEvent, { type: "content" }>
  | {
      id: string;
      type: "activity";
      events: ActivityEvent[];
    };

export interface ActivitySummary {
  stepCount: number;
  status: ToolCallStatus;
}

export function groupAssistantTimeline(timeline: AssistantTimelineEvent[]): AssistantTimelineBlock[] {
  const blocks: AssistantTimelineBlock[] = [];
  let activityEvents: ActivityEvent[] = [];

  const flushActivity = () => {
    if (activityEvents.length === 0) {
      return;
    }
    blocks.push({
      id: `activity-${activityEvents[0]!.id}`,
      type: "activity",
      events: activityEvents,
    });
    activityEvents = [];
  };

  for (const event of timeline) {
    if (event.type === "content") {
      flushActivity();
      if (event.content) {
        blocks.push(event);
      }
    } else if (event.type === "tool-group" || event.content) {
      activityEvents.push(event);
    }
  }
  flushActivity();
  return blocks;
}

export function summarizeActivity(
  events: ActivityEvent[],
  toolCallGroups: ToolCallGroup[],
  missingToolStatus: ToolCallStatus = "pending",
): ActivitySummary {
  const statuses: ToolCallStatus[] = [];
  let stepCount = 0;

  for (const event of events) {
    if (event.type === "reasoning") {
      stepCount += 1;
      continue;
    }
    stepCount += event.toolCallIds.length;
    const group = toolCallGroups.find((candidate) => candidate.round === event.round);
    const calls = new Map(group?.toolCalls.map((toolCall) => [toolCall.toolCallId, toolCall]));
    for (const toolCallId of event.toolCallIds) {
      statuses.push(calls.get(toolCallId)?.status ?? missingToolStatus);
    }
  }

  const activeStatus = statuses.find((status) => status === "awaiting_confirmation") ??
    statuses.find((status) => status === "running") ??
    statuses.find((status) => status === "pending");
  return {
    stepCount,
    status: activeStatus ?? statuses.at(-1) ?? "completed",
  };
}
