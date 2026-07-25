import type { AssistantTimelineEvent, Conversation, ConversationMessage, StoredToolCall } from "@/adapters";

export function isConversation(value: unknown): value is Conversation {
  if (!isRecord(value) || !isBoundedString(value.id, 512) || !isBoundedString(value.title, 4096) || !isBoundedString(value.model, 256) || !isBoundedString(value.workspaceUri, 32_768)) {
    return false;
  }
  if (value.schemaVersion !== 2 && value.schemaVersion !== undefined) {
    return false;
  }
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt) || !Array.isArray(value.messages) || value.messages.length > 10_000) {
    return false;
  }
  return value.messages.every(isConversationMessage);
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!isRecord(value) || !isBoundedString(value.id, 512) || !["user", "assistant", "error", "tool"].includes(value.role as string) || !isBoundedString(value.content, 5 * 1024 * 1024)) {
    return false;
  }
  if (value.createdAt !== undefined && !isTimestamp(value.createdAt)) {
    return false;
  }
  if (value.generationId !== undefined && !isBoundedString(value.generationId, 512)) {
    return false;
  }
  if (value.generationStatus !== undefined && !["completed", "interrupted", "error"].includes(value.generationStatus as string)) {
    return false;
  }
  if (value.timeline !== undefined && (!Array.isArray(value.timeline) || value.timeline.length > 10_000 || !value.timeline.every(isTimelineEvent))) {
    return false;
  }
  if (value.toolCalls !== undefined && (!Array.isArray(value.toolCalls) || value.toolCalls.length > 1_000 || !value.toolCalls.every(isStoredToolCall))) {
    return false;
  }
  return (value.toolCallId === undefined || isBoundedString(value.toolCallId, 512)) && (value.toolName === undefined || isBoundedString(value.toolName, 256));
}

function isTimelineEvent(value: unknown): value is AssistantTimelineEvent {
  if (!isRecord(value) || !isBoundedString(value.id, 512)) {
    return false;
  }
  if (value.type === "reasoning" || value.type === "content") {
    return isBoundedString(value.content, 5 * 1024 * 1024);
  }
  return (
    value.type === "tool-group" &&
    Number.isSafeInteger(value.round) &&
    (value.round as number) >= 1 &&
    Array.isArray(value.toolCallIds) &&
    value.toolCallIds.length <= 1_000 &&
    value.toolCallIds.every((id) => isBoundedString(id, 512))
  );
}

function isStoredToolCall(value: unknown): value is StoredToolCall {
  if (!isRecord(value) || !isBoundedString(value.toolCallId, 512) || !isBoundedString(value.toolName, 256) || !isBoundedString(value.arguments, 5 * 1024 * 1024)) {
    return false;
  }
  return (
    (value.result === undefined || isBoundedString(value.result, 5 * 1024 * 1024)) &&
    (value.isError === undefined || typeof value.isError === "boolean") &&
    (value.round === undefined || (Number.isSafeInteger(value.round) && (value.round as number) >= 1)) &&
    (value.rejected === undefined || typeof value.rejected === "boolean") &&
    (value.requiresConfirmation === undefined || typeof value.requiresConfirmation === "boolean") &&
    (value.dangerLevel === undefined || ["safe", "caution", "dangerous", "destructive"].includes(value.dangerLevel as string)) &&
    (value.dangerConfirmed === undefined || typeof value.dangerConfirmed === "boolean") &&
    ["pending", "awaiting_confirmation", "running", "completed", "rejected", "cancelled", "error"].includes(value.status as string)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
