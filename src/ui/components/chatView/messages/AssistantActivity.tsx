import React from "react";
import type { AssistantTimelineEvent } from "@/contracts";
import type {
  ChatMessage,
  ToolCallGroup,
  ToolCallStatus,
} from "@webview/views/chatView/ChatViewTypes";
import { t } from "@webview/i18n";
import {
  groupAssistantTimeline,
  summarizeActivity,
  type AssistantTimelineBlock,
} from "../tools/timeline/AssistantTimelineGrouping";
import { MarkdownMessage } from "./MarkdownMessage";

export function AssistantActivity({
  timeline,
  toolCallGroups,
  renderToolCallGroups,
  isActive = false,
  generationStatus,
}: {
  timeline: AssistantTimelineEvent[];
  toolCallGroups: ToolCallGroup[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  isActive?: boolean;
  generationStatus?: ChatMessage["generationStatus"];
}) {
  const blocks = groupAssistantTimeline(timeline);
  return (
    <div className="chronologicalAssistant">
      {blocks.map((block, index) =>
        block.type === "activity" ? (
          <ActivityPanel
            key={block.id}
            block={block}
            toolCallGroups={toolCallGroups}
            renderToolCallGroups={renderToolCallGroups}
            missingToolStatus={getMissingToolStatus(blocks, index, isActive, generationStatus)}
          />
        ) : (
          <MarkdownMessage key={block.id} content={block.content} role="assistant" />
        ),
      )}
    </div>
  );
}

function ActivityPanel({
  block,
  toolCallGroups,
  renderToolCallGroups,
  missingToolStatus,
}: {
  block: Extract<AssistantTimelineBlock, { type: "activity" }>;
  toolCallGroups: ToolCallGroup[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  missingToolStatus: ToolCallStatus;
}) {
  const storageKey = `deepseek.activity.expanded.${block.id}`;
  const [open, setOpen] = React.useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const summary = summarizeActivity(block.events, toolCallGroups, missingToolStatus);

  return (
    <details
      className={`collapsiblePanel activity-block ${summary.status}`}
      open={open}
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        try {
          window.localStorage.setItem(storageKey, String(isOpen));
        } catch {
          // The panel still works when webview storage is unavailable.
        }
      }}
    >
      <summary className="collapsiblePanelSummary">
        <span className="collapsiblePanelTitle">{t("chat.activity")}</span>
        <span className="collapsiblePanelMeta activityMeta">
          <span className="activityStepCount">
            {t("chat.activitySteps", { count: summary.stepCount })}
          </span>
          <span className={`activityStatus ${summary.status}`} role="status" aria-live="polite">
            {formatActivityStatus(summary.status)}
          </span>
        </span>
        <span className="collapsiblePanelChevron" aria-hidden="true" />
      </summary>
      <div className="collapsiblePanelBody activityBody">
        {block.events.map((event) => {
          if (event.type === "reasoning") {
            return (
              <section className="activityReasoning" key={event.id}>
                <div className="activityItemLabel">{t("chat.reasoning")}</div>
                <div className="reasoning-content">{event.content}</div>
              </section>
            );
          }
          const group = findTimelineToolGroup(event, toolCallGroups);
          return group
            ? <React.Fragment key={event.id}>{renderToolCallGroups?.([group])}</React.Fragment>
            : null;
        })}
      </div>
    </details>
  );
}

function getMissingToolStatus(
  blocks: AssistantTimelineBlock[],
  blockIndex: number,
  isActive: boolean,
  generationStatus: ChatMessage["generationStatus"],
): ToolCallStatus {
  if (generationStatus === "completed") {return "completed";}
  if (blocks.slice(blockIndex + 1).some((block) => block.type === "content")) {return "completed";}
  if (isActive) {return "pending";}
  return generationStatus === "error" ? "error" : "cancelled";
}

function formatActivityStatus(status: ToolCallStatus): string {
  return t(`tools.${status === "awaiting_confirmation" ? "awaitingConfirmation" : status}`);
}

function findTimelineToolGroup(
  event: Extract<AssistantTimelineEvent, { type: "tool-group" }>,
  groups: ToolCallGroup[],
): ToolCallGroup | undefined {
  const group = groups.find((candidate) => candidate.round === event.round);
  if (!group) {
    return undefined;
  }
  const ids = new Set(event.toolCallIds);
  return {
    ...group,
    toolCalls: group.toolCalls.filter((toolCall) => ids.has(toolCall.toolCallId)),
  };
}

export type { ChatMessage };
