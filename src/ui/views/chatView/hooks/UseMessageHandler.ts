import { useEffect, useRef } from "react";
import type { VsCodeApi } from "@webview/VsCodeApi";
import { WEBVIEW_PROTOCOL_VERSION, type AssistantTimelineEvent, type HandlerToWebviewMessage, type AppConfig, type StoredToolCall, type ToolCall } from "@/adapters";
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
  onConfigLoaded?: (config: Partial<AppConfig>, revision: number) => void;
  onConfigUpdateResult?: (message: Extract<HandlerToWebviewMessage, { type: "configUpdateResult" }>) => void;
  onToolCallStarted?: (data: { generationId?: string; toolCalls: ToolCall[]; round: number }) => void;
  onToolCallResult?: (data: { generationId?: string; toolCallId: string; toolName: string; result: string; isError?: boolean; rejected?: boolean; status: ToolCallStatus }) => void;
  onToolCallActionAccepted?: (data: { generationId?: string; toolCallId: string; status: "running" | "rejected" }) => void;
  onToolCallConfirmationRequired?: (data: { generationId?: string; toolCalls: ToolCall[]; round: number; autoExecute: boolean; dangerConfirmation?: DangerConfirmationData }) => void;
  onToolCallLimitReached?: (data: { generationId?: string; completedRounds: number; batchSize: number }) => void;
  onContextCompactionUpdated?: (data: { generationId: string; status: "compacting" | "completed" }) => void;
  onGenerationSnapshot?: (message: Extract<HandlerToWebviewMessage, { type: "generationSnapshot" }>) => void;
};

/**
 * Registers the webview message listener and routes messages to the dispatcher.
 */
export function useMessageHandler(vscode: VsCodeApi | null, dispatcher: MessageDispatcher): void {
  const dispatcherRef = useRef(dispatcher);
  dispatcherRef.current = dispatcher;

  useEffect(() => {
    if (!vscode) {
      return;
    }

    const handleMessage = (event: MessageEvent<HandlerToWebviewMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "addMessage":
          dispatcherRef.current.onAddMessage?.(message.message);
          break;

        case "showTyping":
          dispatcherRef.current.onShowTyping?.(message.generationId);
          break;

        case "streamTimelineDelta":
          dispatcherRef.current.onStreamTimelineDelta?.({ generationId: message.generationId, eventId: message.eventId, eventType: message.eventType, content: message.content });
          break;

        case "streamTimelineToolGroup":
          dispatcherRef.current.onStreamTimelineToolGroup?.(message.event, message.generationId);
          break;

        case "streamDone":
          dispatcherRef.current.onStreamDone?.({
            cancelled: message.cancelled,
            finish_reason: message.finish_reason,
            generationId: message.generationId,
          });
          break;

        case "streamError":
          dispatcherRef.current.onStreamError?.(message.error, message.generationId);
          break;

        case "clearChat":
          dispatcherRef.current.onClearChat?.();
          break;

        case "modelChanged":
          dispatcherRef.current.onModelChanged?.(message.modelId);
          break;

        case "apiKeyStatus":
          dispatcherRef.current.onApiKeyStatus?.(message.status);
          break;

        case "configLoaded":
          if (message.config.interfaceLanguage) {setInterfaceLanguage(message.config.interfaceLanguage);}
          dispatcherRef.current.onConfigLoaded?.(message.config, message.revision);
          break;

        case "configUpdateResult":
          if (message.config.interfaceLanguage) {setInterfaceLanguage(message.config.interfaceLanguage);}
          dispatcherRef.current.onConfigUpdateResult?.(message);
          break;

        case "toolCallStarted":
          dispatcherRef.current.onToolCallStarted?.({
            generationId: message.generationId,
            toolCalls: message.toolCalls,
            round: message.round,
          });
          break;

        case "toolCallResult":
          dispatcherRef.current.onToolCallResult?.({
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
          dispatcherRef.current.onToolCallActionAccepted?.({ generationId: message.generationId, toolCallId: message.toolCallId, status: message.status });
          break;

        case "toolCallConfirmationRequired":
          dispatcherRef.current.onToolCallConfirmationRequired?.({
            generationId: message.generationId,
            toolCalls: message.toolCalls,
            round: message.round,
            autoExecute: message.autoExecute,
            dangerConfirmation: message.dangerConfirmation,
          });
          break;

        case "toolCallLimitReached":
          dispatcherRef.current.onToolCallLimitReached?.({ generationId: message.generationId, completedRounds: message.completedRounds, batchSize: message.batchSize });
          break;

        case "contextCompactionUpdated":
          dispatcherRef.current.onContextCompactionUpdated?.({ generationId: message.generationId, status: message.status });
          break;

        case "generationSnapshot":
          dispatcherRef.current.onGenerationSnapshot?.(message);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "initializeProtocol", protocolVersion: WEBVIEW_PROTOCOL_VERSION });
    vscode.postMessage({ type: "getConfig" });
    vscode.postMessage({ type: "getGenerationSnapshot" });

    return () => window.removeEventListener("message", handleMessage);
  }, [vscode]);
}
