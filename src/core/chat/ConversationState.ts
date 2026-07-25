import type { AssistantTimelineEvent, ChatMessage, Conversation, ConversationMessage, StoredToolCall } from "@/adapters";
import { randomUUID } from "crypto";
import { createConversationTitle } from "./ConversationTitle";

export interface ConversationStore {
  save(conversation: Conversation): Promise<void>;
  getWorkspaceUri?(): string;
}

export interface SaveConversationTurnOptions {
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage;
  model: string;
}

export interface SaveConversationMessagesOptions {
  messages: ConversationMessage[];
  model: string;
}

export class ConversationState {
  private activeConversation: Conversation | null = null;

  constructor(private readonly conversationStore: ConversationStore) {}

  load(conversation: Conversation): void {
    this.activeConversation = conversation;
  }

  reset(): void {
    this.activeConversation = null;
  }

  forget(id: string): boolean {
    if (this.activeConversation?.id === id) {
      this.reset();
      return true;
    }
    return false;
  }

  getActiveConversationId(): string | undefined {
    return this.activeConversation?.id;
  }

  getConversation(): Conversation | undefined {
    return this.activeConversation ? structuredClone(this.activeConversation) : undefined;
  }

  getApiMessages(): ChatMessage[] {
    return toApiMessages(selectContextMessages(this.activeConversation?.messages ?? []));
  }

  createMessage(
    role: ConversationMessage["role"],
    content: string,
    extra: Pick<ConversationMessage, "timeline" | "toolCalls" | "generationId" | "generationStatus"> = {},
  ): ConversationMessage {
    return {
      id: randomUUID(),
      role,
      content,
      createdAt: Date.now(),
      ...extra,
    };
  }

  async saveTurn(options: SaveConversationTurnOptions): Promise<void> {
    await this.saveMessages({
      messages: [options.userMessage, options.assistantMessage],
      model: options.model,
    });
  }

  async saveMessages(options: SaveConversationMessagesOptions): Promise<void> {
    if (options.messages.length === 0) {
      return;
    }

    const now = Date.now();
    const existing = this.activeConversation;
    const nextMessages = [...(existing?.messages ?? []), ...options.messages];
    const conversation: Conversation = {
      schemaVersion: 2,
      id: existing?.id ?? randomUUID(),
      title: createConversationTitle(nextMessages, existing?.title),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      model: options.model,
      workspaceUri: existing?.workspaceUri ?? this.conversationStore.getWorkspaceUri?.() ?? "workspace:unknown",
      messages: nextMessages,
    };

    this.activeConversation = conversation;
    await this.conversationStore.save(conversation);
  }
}

function toApiMessages(messages: ConversationMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "error") {
      return [];
    }

    if (message.role === "tool") {
      return [
        {
          role: "tool" as const,
          content: message.content,
          tool_call_id: message.toolCallId,
          name: message.toolName,
        },
      ];
    }

    const apiMessage: ChatMessage = {
      role: message.role,
      content: message.content,
    };

    if (message.role === "assistant") {
      if (message.generationStatus === "interrupted") {
        return message.content.trim() ? [apiMessage] : [];
      }
      apiMessage.reasoning_content = collectTimelineText(message.timeline, "reasoning") || null;
      apiMessage.tool_calls = toApiToolCalls(message.toolCalls);
    }

    const toolResults = (message.toolCalls ?? [])
      .filter((toolCall) => toolCall.result !== undefined)
      .map((toolCall) => ({
        role: "tool" as const,
        content: toolCall.result ?? "",
        tool_call_id: toolCall.toolCallId,
        name: toolCall.toolName,
      }));

    return [apiMessage, ...toolResults];
  });
}

const CONTEXT_CHARACTER_BUDGET = 120_000;
const MAX_CONTEXT_FIELD_CHARACTERS = 24_000;

function selectContextMessages(messages: ConversationMessage[]): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let remaining = CONTEXT_CHARACTER_BUDGET;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = trimContextMessage(messages[index]);
    const size = estimateMessageSize(message);
    if (selected.length > 0 && size > remaining) {break;}
    selected.unshift(message);
    remaining -= size;
  }
  return selected;
}

function estimateMessageSize(message: ConversationMessage): number {
  return message.content.length + (message.timeline ?? []).reduce((sum, event) => sum + ("content" in event ? event.content.length : 0), 0) +
    (message.toolCalls ?? []).reduce((sum, tool) => sum + tool.arguments.length + (tool.result?.length ?? 0), 0);
}

function trimContextMessage(message: ConversationMessage): ConversationMessage {
  const trim = (value: string): string => value.length <= MAX_CONTEXT_FIELD_CHARACTERS ? value : `${value.slice(0, 12_000)}\n...[context pruned]...\n${value.slice(-12_000)}`;
  return {
    ...message,
    content: trim(message.content),
    timeline: message.timeline?.map((event) => "content" in event ? { ...event, content: trim(event.content) } : event),
    toolCalls: message.toolCalls?.map((tool) => ({ ...tool, arguments: trim(tool.arguments), result: tool.result === undefined ? undefined : trim(tool.result) })),
  };
}

function collectTimelineText(timeline: AssistantTimelineEvent[] | undefined, type: "reasoning" | "content"): string {
  return (timeline ?? [])
    .filter((event): event is Extract<AssistantTimelineEvent, { type: "reasoning" | "content" }> => event.type === type)
    .map((event) => event.content)
    .join("");
}

function toApiToolCalls(toolCalls: StoredToolCall[] | undefined): ChatMessage["tool_calls"] {
  return toolCalls?.map((toolCall) => ({
    id: toolCall.toolCallId,
    type: "function" as const,
    function: {
      name: toolCall.toolName,
      arguments: toolCall.arguments,
    },
  }));
}
