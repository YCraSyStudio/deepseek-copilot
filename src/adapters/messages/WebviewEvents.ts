import type { ToolCall } from "../deepseek/Chat";
import type { UsageAggregate } from "@/shared/usage/Usage";
import type {
  AssistantTimelineEvent,
  AvailableToolInfo,
  Conversation,
  ConversationSummary,
  DangerConfirmationData,
  GenerationSnapshot,
  PathCompletionItem,
  ProjectInstructionStatusSource,
  QueuedGenerationMessage,
  ReferencedFile,
  StoredToolCall,
  WebviewConfig,
  WorkspaceContextStatus,
  HistoryTransitionPhase,
} from "./WebviewModels";

export type HandlerToWebviewMessage =
  | { type: "protocolReady"; protocolVersion: 1 }
  | { type: "protocolError"; supportedVersion: 1; error: string }
  | { type: "requestRejected"; requestId?: string; action?: string; error: string }
  | { type: "configLoaded"; revision: number; config: Partial<WebviewConfig> }
  | {
      type: "historyTransitionRequired";
      requestId: string;
      phase: HistoryTransitionPhase;
      direction: "enter-incognito" | "exit-incognito";
      activeGenerations: number;
      queuedMessages: number;
    }
  | {
      type: "configUpdateResult";
      requestId: string;
      revision: number;
      operation: "save" | "reset";
      status: "success" | "error" | "cancelled";
      config: Partial<WebviewConfig>;
      credentialUpdated?: boolean;
      error?: string;
    }
  | { type: "connectionTestResult"; success: boolean; error?: string }
  | { type: "apiKeyDeleteResult"; requestId: string; status: "success" | "error" | "cancelled"; error?: string }
  | { type: "apiKeyStatusSettings"; status: "configured" | "missing"; keyPreview?: string }
  | { type: "apiKeyStatus"; status: "configured" | "missing"; keyPreview?: string }
  | { type: "generationAccepted"; generationId: string; conversationId: string; clientRequestId: string }
  | { type: "messageQueued"; conversationId: string; clientRequestId: string; position: number }
  | { type: "generationSnapshot"; generations: GenerationSnapshot[]; recoveredDrafts: Array<{ conversationId: string; messages: QueuedGenerationMessage[] }> }
  | { type: "contextCompactionUpdated"; generationId: string; conversationId: string; status: "compacting" | "completed" }
  | { type: "showTyping"; generationId?: string; conversationId?: string }
  | { type: "streamTimelineDelta"; generationId?: string; conversationId?: string; eventId: string; eventType: "reasoning" | "content"; content: string }
  | { type: "streamTimelineToolGroup"; generationId?: string; conversationId?: string; event: Extract<AssistantTimelineEvent, { type: "tool-group" }> }
  | { type: "streamDone"; generationId?: string; conversationId?: string; cancelled?: boolean; finish_reason?: string }
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
        usage?: UsageAggregate;
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
  | { type: "toolCallStarted"; generationId?: string; conversationId?: string; toolCalls: ToolCall[]; round: number; totalRounds?: number }
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
      dangerConfirmation?: DangerConfirmationData;
    }
  | { type: "availableTools"; tools: AvailableToolInfo[] }
  | { type: "assistantUsageUpdated"; generationId?: string; conversationId?: string; usage: UsageAggregate };
