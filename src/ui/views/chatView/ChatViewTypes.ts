import type { ConversationMessage, HandlerToWebviewMessage, StoredToolCall, DangerConfirmationData } from "@/contracts/messages/Webview";
import type { PermissionMode } from "@/contracts";
import type { ConversationUsageSnapshot, UsageCurrency } from "@/shared/usage/Usage";
import type { GenerationEventScope } from "./hooks/GenerationEventScope";

export type { StoredToolCall, DangerConfirmationData };

export type ChatMessage = ConversationMessage;

export type ApiKeyStatus = "missing" | "configured";

export type InitialConfig = {
  revision: number;
  provider?: string;
  reasoning?: string;
  model?: string;
  permissionMode?: PermissionMode;
  historyEnabled?: boolean;
  usageBreakdown?: boolean;
  usageCostCurrency?: UsageCurrency;
};

/** User action for a tool call. */
export type ToolCallAction = "execute" | "reject";
/** UI status for a tool call. */
export type ToolCallStatus = "pending" | "awaiting_confirmation" | "running" | "completed" | "error" | "rejected" | "cancelled";

/** UI tool call state. */
export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  arguments: string;
  status: ToolCallStatus;
  result?: string;
  round: number;
  requiresConfirmation?: boolean;
  /** Danger details when the tool requires extra confirmation. */
  dangerConfirmation?: DangerConfirmationData;
  /** Whether the user rejected the tool call. */
  rejected?: boolean;
  /** Recorded danger level. */
  dangerLevel?: string;
  /** Whether the danger was confirmed by the user. */
  dangerConfirmed?: boolean;
}

/** Group of tool calls from the same round. */
export interface ToolCallGroup {
  id: string;
  round: number;
  toolCalls: ToolCallState[];
  expanded: boolean;
}

/** Available code-block button actions. */
export type CodeAction = "copy" | "insert";

/** Chat message section props. */
export type MessagesSectionProps = {
  getGenerationScope?: () => GenerationEventScope;
  conversationId?: string;
  activeGenerationId?: string;
  messages?: ChatMessage[];
  onMessagesChange?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isProcessing?: boolean;
  listRef?: React.RefObject<HTMLDivElement | null>;
  onApiKeyStatusChange?: (status: ApiKeyStatus) => void;
  onConfigLoaded?: (config: InitialConfig) => void;
  onConfigUpdateResult?: (message: Extract<HandlerToWebviewMessage, { type: "configUpdateResult" }>) => void;
  permissionUpdatePending?: boolean;
  /** Messages added above the loaded transcript by history paging. */
  earlierMessagesLoaded?: number;
  /**
   * Opaque cursor for the conversation history stored above the loaded
   * transcript. When it is set, the transcript's "show earlier" control keeps
   * working after every loaded message has already been revealed.
   */
  historyCursor?: string;
  onModelChanged?: (modelId: string) => void;
  onProcessingChange?: (isProcessing: boolean) => void;
  /** Conversation-wide usage the host reports, so the total covers paged-out messages. */
  onConversationUsageUpdated?: (usage: ConversationUsageSnapshot) => void;
  onFocusInput?: () => void;
};