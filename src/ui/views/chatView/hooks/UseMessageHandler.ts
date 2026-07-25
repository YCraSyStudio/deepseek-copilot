import { useEffect } from "react";
import type { VsCodeApi } from "@webview/VsCodeApi";
import type { AssistantTimelineEvent, HandlerToWebviewMessage, AppConfig, StoredToolCall, ToolCall } from "@/adapters";
import type { ApiKeyStatus, DangerConfirmationData, ToolCallStatus } from "../ChatViewTypes";
import { setInterfaceLanguage } from "@webview/i18n";

/**
 * Additional streamDone event data.
 */
export type StreamDoneInfo = {
  cancelled?: boolean;
  finish_reason?: string;
};

/**
 * Dispatcher with optional handlers for each webview message type.
 */
export type MessageDispatcher = {
  onAddMessage?: (message: {
    role: string;
    content: string;
    wasStreamed?: boolean;
    toolCalls?: StoredToolCall[];
    timeline?: AssistantTimelineEvent[];
    toolCallId?: string;
    toolName?: string;
  }) => void;
  onShowTyping?: (generationId?: string) => void;
  onStreamTimelineDelta?: (data: { generationId?: string; eventId: string; eventType: "reasoning" | "content"; content: string }) => void;
  onStreamTimelineToolGroup?: (event: Extract<AssistantTimelineEvent, { type: "tool-group" }>, generationId?: string) => void;
  onStreamDone?: (info: StreamDoneInfo & { generationId?: string }) => void;
  onStreamError?: (error: string, generationId?: string) => void;
  onClearChat?: () => void;
  onModelChanged?: (modelId: string) => void;
  onApiKeyStatus?: (status: ApiKeyStatus) => void;
  onConfigLoaded?: (config: Partial<AppConfig>) => void;
  onToolCallStarted?: (data: { generationId?: string; toolCalls: ToolCall[]; round: number }) => void;
  onToolCallResult?: (data: { generationId?: string; toolCallId: string; toolName: string; result: string; isError?: boolean; rejected?: boolean; status: ToolCallStatus }) => void;
  onToolCallActionAccepted?: (data: { generationId?: string; toolCallId: string; status: "running" | "rejected" }) => void;
  onToolCallConfirmationRequired?: (data: { generationId?: string; toolCalls: ToolCall[]; round: number; autoExecute: boolean; dangerConfirmation?: DangerConfirmationData }) => void;
  onToolCallLimitReached?: (data: { generationId?: string; completedRounds: number; batchSize: number }) => void;
};

/**
 * Registers the webview message listener and routes messages to the dispatcher.
 */
export function useMessageHandler(vscode: VsCodeApi | null, dispatcher: MessageDispatcher): void {
  const {
    onAddMessage,
    onShowTyping,
    onStreamTimelineDelta,
    onStreamTimelineToolGroup,
    onStreamDone,
    onStreamError,
    onClearChat,
    onModelChanged,
    onApiKeyStatus,
    onConfigLoaded,
    onToolCallStarted,
    onToolCallResult,
    onToolCallActionAccepted,
    onToolCallConfirmationRequired,
    onToolCallLimitReached,
  } = dispatcher;

  useEffect(() => {
    if (!vscode) {
      return;
    }

    const handleMessage = (event: MessageEvent<HandlerToWebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "addMessage":
          onAddMessage?.(message.message);
          break;

        case "showTyping":
          onShowTyping?.(message.generationId);
          break;

        case "streamTimelineDelta":
          onStreamTimelineDelta?.({ generationId: message.generationId, eventId: message.eventId, eventType: message.eventType, content: message.content });
          break;

        case "streamTimelineToolGroup":
          onStreamTimelineToolGroup?.(message.event, message.generationId);
          break;

        case "streamDone":
          onStreamDone?.({
            cancelled: message.cancelled,
            finish_reason: message.finish_reason,
            generationId: message.generationId,
          });
          break;

        case "streamError":
          onStreamError?.(message.error, message.generationId);
          break;

        case "clearChat":
          onClearChat?.();
          break;

        case "modelChanged":
          onModelChanged?.(message.modelId);
          break;

        case "apiKeyStatus":
          onApiKeyStatus?.(message.status);
          break;

        case "configLoaded":
          if (message.config.interfaceLanguage) {setInterfaceLanguage(message.config.interfaceLanguage);}
          onConfigLoaded?.(message.config);
          break;

        case "toolCallStarted":
          onToolCallStarted?.({
            generationId: message.generationId,
            toolCalls: message.toolCalls,
            round: message.round,
          });
          break;

        case "toolCallResult":
          onToolCallResult?.({
            generationId: message.generationId,
            toolCallId: message.toolCallId,
            toolName: message.toolName,
            result: message.result,
            isError: message.isError,
            rejected: message.rejected,
            status: message.status,
          });
          break;

        case "toolCallActionAccepted":
          onToolCallActionAccepted?.({ generationId: message.generationId, toolCallId: message.toolCallId, status: message.status });
          break;

        case "toolCallConfirmationRequired":
          onToolCallConfirmationRequired?.({
            generationId: message.generationId,
            toolCalls: message.toolCalls,
            round: message.round,
            autoExecute: message.autoExecute,
            dangerConfirmation: message.dangerConfirmation,
          });
          break;

        case "toolCallLimitReached":
          onToolCallLimitReached?.({ generationId: message.generationId, completedRounds: message.completedRounds, batchSize: message.batchSize });
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "getConfig" });
    vscode.postMessage({ type: "getGenerationSnapshot" });

    return () => window.removeEventListener("message", handleMessage);
  }, [
    vscode,
    onAddMessage,
    onShowTyping,
    onStreamTimelineDelta,
    onStreamTimelineToolGroup,
    onStreamDone,
    onStreamError,
    onClearChat,
    onModelChanged,
    onApiKeyStatus,
    onConfigLoaded,
    onToolCallStarted,
    onToolCallResult,
    onToolCallActionAccepted,
    onToolCallConfirmationRequired,
    onToolCallLimitReached,
  ]);
}
