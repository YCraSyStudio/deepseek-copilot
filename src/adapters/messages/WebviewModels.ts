import type { AppConfig } from "../Config";

export type ChatPersistenceMode = "persistent" | "incognito";
export type HistoryTransitionPhase = "stop-work" | "exit-incognito";
export type HistoryTransitionDecision = "stop" | "save" | "discard" | "cancel";

export type WebviewConfig = Omit<AppConfig, "apiKey">;

/** Tool call information stored in a message (for persistence). */
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
  | { id: string; type: "reasoning"; content: string }
  | { id: string; type: "content"; content: string }
  | { id: string; type: "tool-group"; round: number; toolCallIds: string[] };

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
  name?: string;
  content?: string;
  language?: string;
  type: "file" | "directory";
  size?: number;
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
