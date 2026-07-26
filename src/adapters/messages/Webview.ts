import type { AppConfig } from "../Config";
import type { ToolCall } from "../deepseek/Chat";

/** Tool call information stored in a message (for persistence) */
export interface StoredToolCall {
  toolCallId: string;
  toolName: string;
  arguments: string;
  result?: string;
  isError?: boolean;
  round?: number;
  rejected?: boolean;
  requiresConfirmation?: boolean;
  dangerLevel?: string;
  dangerConfirmed?: boolean;
  dangerConfirmation?: DangerConfirmationData;
  status: "pending" | "awaiting_confirmation" | "running" | "completed" | "rejected" | "cancelled" | "error";
}

export type AssistantTimelineEvent =
  | {
      id: string;
      type: "reasoning";
      content: string;
    }
  | {
      id: string;
      type: "content";
      content: string;
    }
  | {
      id: string;
      type: "tool-group";
      round: number;
      toolCallIds: string[];
    };

/** Additional confirmation data for dangerous tool calls. */
export interface DangerConfirmationData {
  requiresConfirmation: true;
  dangerLevel: "safe" | "caution" | "dangerous" | "destructive";
  warningMessage: string;
  command?: string;
  filePath?: string;
  cwd?: string;
  shell?: string;
  beforeHash?: string;
  canTrustForSession?: boolean;
}

export type ConversationMessageRole = "user" | "assistant" | "error" | "tool";

export interface ConversationMessage {
  id: string;
  role: ConversationMessageRole;
  content: string;
  timeline?: AssistantTimelineEvent[];
  toolCalls?: StoredToolCall[];
  toolCallId?: string;
  toolName?: string;
  createdAt?: number;
  generationId?: string;
  generationStatus?: "completed" | "interrupted" | "error";
}

export interface QueuedGenerationMessage {
  clientRequestId: string;
  text: string;
  queuedAt: number;
}

export interface WorkspaceFolderBinding {
  uri: string;
  name: string;
  alias: string;
  scheme: string;
}

export interface WorkspaceCapabilities {
  files: boolean;
  search: boolean;
  git: boolean;
  terminal: boolean;
}

export interface WorkspaceBinding {
  schemaVersion: 1;
  uri: string;
  name: string;
  revision: string;
  folders: WorkspaceFolderBinding[];
  capabilities: WorkspaceCapabilities;
}

export type WorkspaceConnectionState = "connected" | "disconnected" | "changed" | "empty";

export interface WorkspaceContextStatus {
  binding: WorkspaceBinding;
  state: WorkspaceConnectionState;
  defaultFolderAlias?: string;
}

export interface WorkspaceRebinding {
  fromWorkspaceUri: string;
  toWorkspaceUri: string;
  at: number;
}

export interface GenerationSnapshot {
  generationId: string;
  conversationId: string;
  status: "starting" | "compacting" | "streaming" | "awaiting_confirmation" | "running_tool" | "interrupted" | "completed" | "error";
  userMessage: ConversationMessage;
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls: StoredToolCall[];
  queue: QueuedGenerationMessage[];
}

export interface Conversation {
  /** Required for new data; optional only during the temporary v1 migration window. */
  schemaVersion?: 2;
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
  model: string;
  workspaceUri: string;
  workspaceBinding?: WorkspaceBinding;
  workspaceRebindings?: WorkspaceRebinding[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messageCount: number;
  sizeBytes: number;
  workspaceUri: string;
}

export interface AvailableToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface AvailableToolInfo {
  name: string;
  description: string;
  parameters: AvailableToolParameter[];
}

export interface PathCompletionItem {
  label: string;
  path: string;
  type: "file" | "directory";
}

export interface ReferencedFile {
  path: string;
  content?: string;
  type: "file" | "directory";
  selection?: { startLine: number; startCharacter: number; endLine: number; endCharacter: number };
  referenceId?: string;
  scope?: "workspace" | "external-snapshot";
  rootUri?: string;
  bindingRevision?: string;
}

export interface ProjectInstructionStatusSource {
  path: string;
  scope: "home" | "workspace" | "workspace-local";
  precedence: number;
  bytes: number;
}

export type WebviewToHandlerMessage =
  | { type: "getConfig" }
  | { type: "saveConfig"; requestId: string; config: Partial<AppConfig> }
  | { type: "resetConfig"; requestId: string }
  | { type: "testConnection"; apiKey: string; baseUrl: string; model: string }
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
  | { type: "openFile"; path: string; line?: number; conversationId?: string; workspaceRevision?: string };

export type HandlerToWebviewMessage =
  | { type: "configLoaded"; revision: number; config: Partial<AppConfig> }
  | {
      type: "configUpdateResult";
      requestId: string;
      revision: number;
      operation: "save" | "reset";
      status: "success" | "error" | "cancelled";
      config: Partial<AppConfig>;
      error?: string;
    }
  | { type: "connectionTestResult"; success: boolean; error?: string }
  | { type: "apiKeyStatusSettings"; status: "configured" | "missing"; keyPreview?: string }
  | { type: "apiKeyStatus"; status: "configured" | "missing"; keyPreview?: string }
  | { type: "generationAccepted"; generationId: string; conversationId: string; clientRequestId: string }
  | { type: "messageQueued"; conversationId: string; clientRequestId: string; position: number }
  | { type: "generationSnapshot"; generations: GenerationSnapshot[]; recoveredDrafts: Array<{ conversationId: string; messages: QueuedGenerationMessage[] }> }
  | { type: "contextCompactionUpdated"; generationId: string; conversationId: string; status: "compacting" | "completed" }
  | { type: "showTyping"; generationId?: string; conversationId?: string }
  | { type: "streamTimelineDelta"; generationId?: string; conversationId?: string; eventId: string; eventType: "reasoning" | "content"; content: string }
  | { type: "streamTimelineToolGroup"; generationId?: string; conversationId?: string; event: Extract<AssistantTimelineEvent, { type: "tool-group" }> }
  | {
      type: "streamDone";
      generationId?: string;
      conversationId?: string;
      cancelled?: boolean;
      finish_reason?: string;
    }
  | { type: "streamError"; generationId?: string; conversationId?: string; error: string }
  | {
      type: "addMessage";
      message: {
        role: "user" | "assistant" | "tool";
        content: string;
        wasStreamed?: boolean;
        toolCalls?: StoredToolCall[];
        timeline?: AssistantTimelineEvent[];
        toolCallId?: string;
        toolName?: string;
      };
    }
  | { type: "clearChat" }
  | { type: "activeConversationChanged"; id: string }
  | { type: "projectInstructionsStatus"; sources: ProjectInstructionStatusSource[]; homeAgentsAllowed: boolean }
  | { type: "workspaceContextChanged"; context: WorkspaceContextStatus }
  | { type: "workspaceRebindResult"; success: boolean; context?: WorkspaceContextStatus; error?: string }
  | { type: "contextFilesSelected"; files: ReferencedFile[] }
  | { type: "pathCompletions"; requestId: number; query: string; workspaceRevision: string; items: PathCompletionItem[] }
  | { type: "modelChanged"; modelId: string }
  | { type: "history"; conversations: ConversationSummary[] }
  | { type: "historyError"; error: string }
  | { type: "conversationLoaded"; conversation: Conversation }
  | { type: "conversationDeleted"; id: string }
  | {
      type: "toolCallStarted";
      generationId?: string;
      conversationId?: string;
      toolCalls: ToolCall[];
      round: number;
      totalRounds?: number;
    }
  | {
      type: "toolCallResult";
      generationId?: string;
      conversationId?: string;
      toolCallId: string;
      toolName: string;
      result: string;
      isError?: boolean;
      rejected?: boolean;
      status: "completed" | "rejected" | "cancelled" | "error";
    }
  | { type: "toolCallActionAccepted"; generationId?: string; conversationId?: string; toolCallId: string; status: "running" | "rejected" }
  | { type: "toolCallLimitReached"; generationId?: string; conversationId?: string; completedRounds: number; batchSize: number }
  | {
      type: "toolCallConfirmationRequired";
      generationId?: string;
      conversationId?: string;
      toolCalls: ToolCall[];
      round: number;
      autoExecute: boolean;
      /** Danger details when a tool detects an operation that needs confirmation. */
      dangerConfirmation?: DangerConfirmationData;
    }
  | {
      type: "availableTools";
      tools: AvailableToolInfo[];
    };
