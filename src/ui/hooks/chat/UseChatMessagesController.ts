import { useCallback, useRef, useState } from "react";
import type { AppConfig, HandlerToWebviewMessage } from "@/adapters";
import type { ChatMessage, InitialConfig, StoredToolCall } from "../../views/chatView/ChatViewTypes";
import { useStreamHandler, type MessageDispatcher } from "../../views/chatView/hooks";

interface ChatMessagesControllerOptions {
  externalMessages?: ChatMessage[];
  externalSetMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  externalIsProcessing?: boolean;
  externalListRef?: React.RefObject<HTMLDivElement | null>;
  onApiKeyStatusChange?: (status: "configured" | "missing") => void;
  onConfigLoaded?: (config: InitialConfig) => void;
  onConfigUpdateResult?: (message: Extract<HandlerToWebviewMessage, { type: "configUpdateResult" }>) => void;
  onModelChanged?: (modelId: string) => void;
  onProcessingChange?: (isProcessing: boolean) => void;
  onGenerationCancelled?: () => void;
  focusInput: () => void;
}

export function useChatMessagesController({
  externalMessages,
  externalSetMessages,
  externalIsProcessing,
  externalListRef,
  onApiKeyStatusChange,
  onConfigLoaded,
  onConfigUpdateResult,
  onModelChanged,
  onProcessingChange,
  onGenerationCancelled,
  focusInput,
}: ChatMessagesControllerOptions) {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([]);
  const [internalIsProcessing, setInternalIsProcessing] = useState(false);
  const internalListRef = useRef<HTMLDivElement | null>(null);
  const activeGenerationIdRef = useRef<string | undefined>(undefined);
  const { nextMessageId, streamingMessageIdRef, appendTimelineDelta, appendTimelineToolGroup, flushTimelineDeltas, resetStreaming } = useStreamHandler();

  const messages = externalMessages ?? internalMessages;
  const setMessages = externalSetMessages ?? setInternalMessages;
  const isProcessing = externalIsProcessing ?? internalIsProcessing;
  const listRef = externalListRef ?? internalListRef;

  const setProcessing = useCallback(
    (value: boolean) => {
      setInternalIsProcessing(value);
      onProcessingChange?.(value);
    },
    [onProcessingChange],
  );

  const dispatcher: MessageDispatcher = {
    onAddMessage: useCallback(
      (message) => {
        flushTimelineDeltas();
        const { wasStreamed, ...rest } = message;
        setMessages((current) => {
          if (wasStreamed && rest.role === "assistant") {
            if (!streamingMessageIdRef.current) {
              return [...current, {
                id: nextMessageId(),
                role: "assistant",
                content: rest.content,
                toolCalls: rest.toolCalls as StoredToolCall[] | undefined,
                timeline: rest.timeline,
              }];
            }
            return updateStreamedAssistant(current, streamingMessageIdRef.current, rest.toolCalls, rest.timeline);
          }

          return [
            ...current,
            {
              id: nextMessageId(),
              role: rest.role as ChatMessage["role"],
              content: rest.content,
              toolCalls: rest.toolCalls as StoredToolCall[] | undefined,
              timeline: rest.timeline,
            },
          ];
        });
      },
      [nextMessageId, setMessages, streamingMessageIdRef, flushTimelineDeltas],
    ),

    onShowTyping: useCallback((generationId?: string) => {
      activeGenerationIdRef.current = generationId;
      setProcessing(true);
      resetStreaming();
    }, [setProcessing, resetStreaming]),

    onStreamTimelineDelta: useCallback(
      ({ generationId, eventId, eventType, content }) => {
        if (activeGenerationIdRef.current && generationId && generationId !== activeGenerationIdRef.current) {
          return;
        }
        appendTimelineDelta(eventId, eventType, content, setMessages);
      },
      [appendTimelineDelta, setMessages],
    ),

    onStreamTimelineToolGroup: useCallback(
      (event, generationId) => {
        if (activeGenerationIdRef.current && generationId && generationId !== activeGenerationIdRef.current) {
          return;
        }
        appendTimelineToolGroup(event, setMessages);
      },
      [appendTimelineToolGroup, setMessages],
    ),

    onStreamDone: useCallback(
      (info) => {
        if (activeGenerationIdRef.current && info.generationId && info.generationId !== activeGenerationIdRef.current) {
          return;
        }
        activeGenerationIdRef.current = undefined;
        flushTimelineDeltas();
        setProcessing(false);

        if (info.cancelled) {
          resetStreaming();
          onGenerationCancelled?.();
          focusInput();
          return;
        }

        if (info.finish_reason === "insufficient_system_resource") {
          console.warn("[ChatView] Stream ended because of insufficient system resources");
        }

        focusInput();
      },
      [focusInput, setMessages, setProcessing, resetStreaming, onGenerationCancelled, flushTimelineDeltas],
    ),

    onStreamError: useCallback(
      (error: string, generationId?: string) => {
        if (activeGenerationIdRef.current && generationId && generationId !== activeGenerationIdRef.current) {
          return;
        }
        activeGenerationIdRef.current = undefined;
        setProcessing(false);
        resetStreaming();
        setMessages((current) => [...current, { id: nextMessageId(), role: "error", content: error }]);
        focusInput();
      },
      [focusInput, setProcessing, resetStreaming, nextMessageId, setMessages],
    ),

    onClearChat: useCallback(() => {
      setMessages([]);
      setProcessing(false);
      resetStreaming();
    }, [setMessages, setProcessing, resetStreaming]),

    onModelChanged: useCallback((modelId: string) => onModelChanged?.(modelId), [onModelChanged]),
    onApiKeyStatus: useCallback((status) => onApiKeyStatusChange?.(status), [onApiKeyStatusChange]),
    onConfigLoaded: useCallback(
      (config: Partial<AppConfig>, revision: number) => {
        onConfigLoaded?.({
          revision,
          reasoning: config.thinkingMode === false ? "off" : config.reasoningEffort === "max" ? "max" : "high",
          model: config.model ?? undefined,
          permissionMode: config.permissionMode,
        });
      },
      [onConfigLoaded],
    ),
    onConfigUpdateResult: useCallback((message) => onConfigUpdateResult?.(message), [onConfigUpdateResult]),
  };

  return { messages, isProcessing, listRef, dispatcher };
}

function updateStreamedAssistant(
  current: ChatMessage[],
  streamingId: string | null,
  toolCalls: StoredToolCall[] | undefined,
  timeline: ChatMessage["timeline"],
): ChatMessage[] {
  const patch = (message: ChatMessage): ChatMessage => ({
    ...message,
    toolCalls: toolCalls as StoredToolCall[] | undefined,
    timeline: timeline ?? message.timeline,
  });

  if (streamingId) {
    const index = current.findIndex((message) => message.id === streamingId);
    if (index >= 0) {
      return current.map((message, messageIndex) => (messageIndex === index ? patch(message) : message));
    }
  }

  return current;
}
