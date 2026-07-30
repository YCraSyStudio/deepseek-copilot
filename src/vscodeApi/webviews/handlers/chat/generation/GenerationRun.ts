import * as vscode from "vscode";
import type { AssistantTimelineEvent, ConversationMessage, PermissionSnapshot, StoredToolCall } from "@/adapters";
import type { ConversationState } from "@/core/chat/ConversationState";
import type { ProviderTranscript } from "@/core/chat/ProviderTranscript";
import type { ToolCallSession } from "../toolCalls/ToolCallSession";
import { isStoredToolStatus, upsertStoredToolCall } from "../ChatHandlerSupport";
import { isDangerConfirmationData } from "@/core/chat/ConversationValidation";

export interface GenerationRunRecord {
  generationId: string;
  conversationId: string;
  clientRequestId: string;
  state: ConversationState;
  session: ToolCallSession;
  userMessage?: ConversationMessage;
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls: StoredToolCall[];
  status: "starting" | "compacting" | "streaming" | "awaiting_confirmation" | "running_tool" | "interrupted" | "completed" | "error";
  eventLog: Array<Record<string, unknown>>;
  checkpointTimer?: ReturnType<typeof setTimeout>;
  permissionSnapshot?: PermissionSnapshot;
  providerTranscript?: ProviderTranscript;
}

export interface GenerationEventCallbacks {
  scheduleCheckpoint: (record: GenerationRunRecord) => void;
  checkpointImmediately: (record: GenerationRunRecord) => void;
  postIfSelected: (record: GenerationRunRecord, message: Record<string, unknown>) => void;
}

export function createGenerationWebview(
  record: GenerationRunRecord,
  callbacks: GenerationEventCallbacks,
): vscode.WebviewView {
  return {
    webview: {
      postMessage: async (message: unknown) => {
        handleGenerationEvent(record, message, callbacks);
        return true;
      },
    },
  } as unknown as vscode.WebviewView;
}

export function handleGenerationEvent(
  record: GenerationRunRecord,
  value: unknown,
  callbacks: GenerationEventCallbacks,
): void {
  if (!value || typeof value !== "object") {
    return;
  }
  const message: Record<string, unknown> = {
    ...(value as Record<string, unknown>),
    generationId: record.generationId,
    conversationId: record.conversationId,
  };
  const type = typeof message.type === "string" ? message.type : "";
  if (type === "streamTimelineDelta" && typeof message.content === "string" && typeof message.eventId === "string") {
    record.content += message.eventType === "content" ? message.content : "";
    const existing = record.timeline.find((event) => event.id === message.eventId);
    if (existing && (existing.type === "content" || existing.type === "reasoning")) {
      existing.content += message.content;
    } else if (message.eventType === "content" || message.eventType === "reasoning") {
      record.timeline.push({ id: message.eventId, type: message.eventType, content: message.content });
    }
    record.status = "streaming";
    callbacks.scheduleCheckpoint(record);
  } else if (type === "streamTimelineToolGroup" && message.event && typeof message.event === "object") {
    record.timeline.push(structuredClone(message.event) as AssistantTimelineEvent);
    record.status = "running_tool";
    callbacks.checkpointImmediately(record);
  } else if (type === "toolCallConfirmationRequired") {
    const toolCalls = Array.isArray(message.toolCalls)
      ? message.toolCalls as Array<{ id: string; function: { name: string; arguments: string } }>
      : [];
    const dangerConfirmation = isDangerConfirmationData(message.dangerConfirmation)
      ? structuredClone(message.dangerConfirmation)
      : undefined;
    for (const toolCall of toolCalls) {
      upsertStoredToolCall(record.toolCalls, {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        arguments: toolCall.function.arguments,
        status: "awaiting_confirmation",
        requiresConfirmation: true,
        dangerLevel: dangerConfirmation?.dangerLevel,
        dangerConfirmation,
        round: typeof message.round === "number" ? message.round : undefined,
      });
    }
    record.status = "awaiting_confirmation";
    callbacks.checkpointImmediately(record);
  } else if (type === "toolCallStarted") {
    const toolCalls = Array.isArray(message.toolCalls)
      ? message.toolCalls as Array<{ id: string; function: { name: string; arguments: string } }>
      : [];
    for (const toolCall of toolCalls) {
      upsertStoredToolCall(record.toolCalls, {
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        arguments: toolCall.function.arguments,
        status: "running",
        round: typeof message.round === "number" ? message.round : undefined,
      });
    }
    record.status = "running_tool";
    callbacks.checkpointImmediately(record);
  } else if (type === "toolCallResult" && typeof message.toolCallId === "string") {
    const existing = record.toolCalls.find((tool) => tool.toolCallId === message.toolCallId);
    if (existing) {
      existing.status = isStoredToolStatus(message.status) ? message.status : "error";
      existing.result = typeof message.result === "string" ? message.result : "";
      existing.isError = message.isError === true;
      existing.requiresConfirmation = false;
      existing.dangerConfirmation = undefined;
    }
    record.status = "running_tool";
    callbacks.checkpointImmediately(record);
  } else if (type === "toolCallActionAccepted" && typeof message.toolCallId === "string") {
    const existing = record.toolCalls.find((tool) => tool.toolCallId === message.toolCallId);
    if (existing && (message.status === "running" || message.status === "rejected")) {
      existing.status = message.status;
      existing.requiresConfirmation = false;
      existing.dangerConfirmation = undefined;
    }
    record.status = "running_tool";
    callbacks.checkpointImmediately(record);
  } else if (type === "addMessage") {
    const added = message.message as { toolCalls?: StoredToolCall[] } | undefined;
    if (added?.toolCalls) {
      record.toolCalls = structuredClone(added.toolCalls);
    }
  } else if (type === "streamError") {
    record.status = "error";
  }

  record.eventLog.push(message);
  callbacks.postIfSelected(record, message);
}
