import type { ChatMessage, ConversationMessage, WorkspaceBinding } from "@/adapters";
import { randomUUID } from "crypto";
import { createConversationTitle } from "./ConversationTitle";
import type {
  ConversationContextSummary,
  StoredConversation,
  StoredConversationMessage,
} from "./ProviderTranscript";

export interface ApiContextUnit {
  generationId: string;
  messages: ChatMessage[];
  visibleText: string;
}

export interface ConversationStore {
  save(conversation: StoredConversation): Promise<void>;
  getWorkspaceUri?(): string;
  getWorkspaceBinding?(): WorkspaceBinding;
}

export interface SaveConversationTurnOptions {
  userMessage: StoredConversationMessage;
  assistantMessage: StoredConversationMessage;
  model: string;
}

export interface SaveConversationMessagesOptions {
  messages: StoredConversationMessage[];
  model: string;
}

export class ConversationState {
  private activeConversation: StoredConversation | null = null;

  constructor(private readonly conversationStore: ConversationStore) {}

  load(conversation: StoredConversation): void {
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

  getConversation(): StoredConversation | undefined {
    return this.activeConversation ? structuredClone(this.activeConversation) : undefined;
  }

  getApiMessages(): ChatMessage[] {
    return this.getApiContextUnits().flatMap((unit) => unit.messages);
  }

  getApiContextUnits(): ApiContextUnit[] {
    const conversation = this.activeConversation;
    if (!conversation) {
      return [];
    }

    const coveredGenerationIds = new Set(
      conversation.contextSummary?.coveredGenerationIds ?? [],
    );
    const grouped = new Map<string, StoredConversationMessage[]>();
    for (const message of conversation.messages) {
      const generationId = message.generationId ?? `message:${message.id}`;
      if (coveredGenerationIds.has(generationId)) {
        continue;
      }
      const existing = grouped.get(generationId);
      if (existing) {
        existing.push(message);
      } else {
        grouped.set(generationId, [message]);
      }
    }

    return [...grouped.entries()]
      .map(([generationId, messages]) => ({
        generationId,
        messages: toApiMessages(messages),
        visibleText: toVisibleContextText(messages),
      }))
      .filter((unit) => unit.messages.length > 0);
  }

  createMessage(
    role: ConversationMessage["role"],
    content: string,
    extra: Pick<StoredConversationMessage, "timeline" | "toolCalls" | "generationId" | "generationStatus" | "providerTranscript"> = {},
  ): StoredConversationMessage {
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
    const conversation: StoredConversation = {
      schemaVersion: 2,
      id: existing?.id ?? randomUUID(),
      title: createConversationTitle(nextMessages, existing?.title),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      model: options.model,
      workspaceUri: existing?.workspaceUri ?? this.conversationStore.getWorkspaceBinding?.().uri ?? this.conversationStore.getWorkspaceUri?.() ?? "workspace:unknown",
      workspaceBinding: existing?.workspaceBinding ?? this.conversationStore.getWorkspaceBinding?.(),
      workspaceRebindings: existing?.workspaceRebindings,
      contextSummary: existing?.contextSummary,
      messages: nextMessages,
    };

    this.activeConversation = conversation;
    await this.conversationStore.save(conversation);
  }

  async saveContextSummary(summary: ConversationContextSummary): Promise<void> {
    if (!this.activeConversation) {
      throw new Error("Cannot save context summary without an active conversation");
    }
    this.activeConversation = {
      ...this.activeConversation,
      contextSummary: structuredClone(summary),
      updatedAt: Date.now(),
    };
    await this.conversationStore.save(this.activeConversation);
  }
}

function toVisibleContextText(messages: StoredConversationMessage[]): string {
  return messages
    .flatMap((message) => {
      if (message.role === "user") {
        return [`User: ${message.content}`];
      }
      if (message.role === "assistant") {
        const parts = message.content.trim() ? [`Assistant: ${message.content}`] : [];
        for (const toolCall of message.toolCalls ?? []) {
          if (toolCall.result?.trim()) {
            parts.push(`Tool ${toolCall.toolName} result:\n${toolCall.result}`);
          }
        }
        return parts;
      }
      if (message.role === "tool") {
        const results = message.toolCalls
          ?.map((toolCall) => toolCall.result)
          .filter((result): result is string => Boolean(result?.trim()))
          .join("\n");
        return results ? [`Tool result:\n${results}`] : [];
      }
      return [];
    })
    .join("\n\n");
}

function toApiMessages(messages: StoredConversationMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "error" || message.role === "tool") {
      return [];
    }

    if (message.role === "user") {
      return [{ role: "user" as const, content: message.content }];
    }

    if (message.generationStatus === "interrupted") {
      return message.content.trim() ? [{ role: "assistant" as const, content: message.content }] : [];
    }

    return message.providerTranscript?.status === "complete"
      ? structuredClone(message.providerTranscript.messages)
      : message.content.trim() ? [{ role: "assistant" as const, content: message.content }] : [];
  });
}
