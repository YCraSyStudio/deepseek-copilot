import type { AppConfig } from "../Config";
import type { ReferencedFile } from "./WebviewModels";

export type WebviewToHandlerMessage =
  | { type: "getConfig" }
  | { type: "saveConfig"; requestId: string; config: Partial<AppConfig> }
  | { type: "resetConfig"; requestId: string }
  | { type: "resolveHistoryTransition"; requestId: string; decision: "stop" | "save" | "discard" | "cancel" }
  | { type: "deleteApiKey"; requestId: string }
  | { type: "testConnection"; apiKey?: string; baseUrl: string; model: string }
  | {
      type: "sendMessage";
      clientRequestId: string;
      text: string;
      modelId: string;
      reasoning: string;
      conversationId?: string;
      workspaceRevision?: string;
      referencedFiles?: ReferencedFile[];
    }
  | {
      type: "steerGeneration";
      generationId: string;
      clientRequestId: string;
      text: string;
      modelId: string;
      reasoning: string;
      conversationId: string;
      workspaceRevision?: string;
      referencedFiles?: ReferencedFile[];
    }
  | { type: "cancelGeneration"; generationId: string }
  | { type: "getGenerationSnapshot" }
  | { type: "consumeRecoveredDraft"; conversationId: string; clientRequestId: string }
  | { type: "copyCode"; code: string }
  | { type: "insertCode"; code: string; conversationId?: string; workspaceRevision?: string }
  | { type: "selectModel"; modelId: string }
  | { type: "newConversation" }
  | { type: "getHistory" }
  | { type: "loadConversation"; id: string }
  | { type: "deleteConversation"; id: string }
  | { type: "deleteConversations"; ids: string[] }
  | { type: "executeToolCall"; generationId: string; toolCallId: string; action: "execute" | "reject"; trustForSession?: boolean }
  | { type: "toolCallLimitDecision"; generationId: string; action: "continue" | "stop" }
  | { type: "getWorkspaceContext"; conversationId?: string }
  | { type: "rebindConversationWorkspace"; conversationId: string; workspaceRevision?: string }
  | { type: "openConversationWorkspace"; conversationId: string }
  | { type: "selectContextFiles"; conversationId?: string }
  | { type: "getPathCompletions"; requestId: number; query: string; conversationId?: string; workspaceRevision?: string }
  | { type: "getAvailableTools" }
  | { type: "openFile"; path: string; line?: number; conversationId?: string; workspaceRevision?: string }
  | { type: "openFileDiff"; path: string; diff: string; conversationId?: string; workspaceRevision?: string };
