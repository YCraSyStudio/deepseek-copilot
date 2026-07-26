import { useCallback, useEffect, useRef, useState } from "react";
import "./MessagesSection.css";
import { useVsCode } from "../../contexts";
import type { MessagesSectionProps } from "../../ChatViewTypes";
import { useMessageHandler } from "../../hooks";
import { ChatEmptyState, ChatMessages, ToolCallConfirmationModal, ToolCallTimeline } from "@webview/components/chatView";
import { useChatMessagesController, useCodeActionHandler, useToolCallController } from "../../../../hooks/chat";
import { t } from "@webview/i18n";
import ToolCallLimitModal from "@webview/components/chatView/toolCallLimitModal/ToolCallLimitModal";

function MessagesSection({
  conversationId,
  messages: externalMessages,
  onMessagesChange,
  isProcessing: externalIsProcessing,
  listRef: externalListRef,
  onApiKeyStatusChange,
  onConfigLoaded,
  onConfigUpdateResult,
  permissionUpdatePending = false,
  onModelChanged,
  onProcessingChange,
  onGenerationCancelled,
  onFocusInput,
}: MessagesSectionProps) {
  const vscode = useVsCode();
  const focusInput = useCallback(() => onFocusInput?.(), [onFocusInput]);
  const handleCodeAction = useCodeActionHandler(vscode);

  const chat = useChatMessagesController({
    externalMessages,
    externalSetMessages: onMessagesChange,
    externalIsProcessing,
    externalListRef,
    onApiKeyStatusChange,
    onConfigLoaded,
    onConfigUpdateResult,
    onModelChanged,
    onProcessingChange,
    onGenerationCancelled,
    focusInput,
  });

  const tools = useToolCallController({
    messages: chat.messages,
    isProcessing: chat.isProcessing,
    vscode,
    actionsDisabled: permissionUpdatePending,
  });
  const { dispatcher: chatDispatcher, isProcessing, listRef, messages } = chat;
  const dispatcher = mergeMessageDispatchers(chatDispatcher, tools.dispatcher);
  const followsLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);

  useMessageHandler(vscode, {
    ...dispatcher,
    onContextCompactionUpdated: ({ status }) => setIsCompacting(status === "compacting"),
    onGenerationSnapshot: (message) => {
      setIsCompacting(message.generations.some(
        (generation) => generation.conversationId === conversationId && generation.status === "compacting",
      ));
    },
    onStreamDone: (info) => {
      setIsCompacting(false);
      dispatcher.onStreamDone?.(info);
    },
    onStreamError: (error, generationId) => {
      setIsCompacting(false);
      dispatcher.onStreamError?.(error, generationId);
    },
  });

  useEffect(() => {
    if (!followsLatestRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages, isProcessing, tools.activeTimelineGroups, listRef]);

  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const followsLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 72;
    followsLatestRef.current = followsLatest;
    setShowJumpToLatest(!followsLatest);
  }, [listRef]);

  const jumpToLatest = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    followsLatestRef.current = true;
    setShowJumpToLatest(false);
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [listRef]);

  const emptyStateVisible = messages.length === 0 && !isProcessing;
  return (
    <>
      <div className="msgList" ref={listRef} onClick={handleCodeAction} onScroll={handleScroll} aria-busy={isProcessing}>
        {emptyStateVisible ? (
          <ChatEmptyState />
        ) : (
          <>
            <ChatMessages
              messages={messages}
              activeToolCallGroups={tools.activeTimelineGroups}
              renderToolCallGroups={(groups) => (
                <ToolCallTimeline
                  groups={groups}
                  vscode={vscode}
                />
              )}
            />
          </>
        )}

        {isProcessing ? (
          <div className="typingIndicator" role="status" aria-live="polite">
            <div className="typingDots">
              <span /> <span /> <span />
            </div>
            <span className="typingLabel">{t(isCompacting ? "chat.compactingContext" : "chat.deepseekIsThinking")}</span>
          </div>
        ) : null}
      </div>
      {showJumpToLatest ? (
        <button className="jumpToLatest" type="button" onClick={jumpToLatest} aria-label={t("chat.jumpToLatest")}>
          <span className="codicon codicon-arrow-down" aria-hidden="true" />
          {t("chat.latest")}
        </button>
      ) : null}
      <span className="streamStatus srOnly" role="status" aria-live="polite">
        {isProcessing ? t("chat.streaming") : t("chat.finished")}
      </span>
      <ToolCallConfirmationModal
        pendingToolCalls={tools.pendingToolCalls}
        onExecute={tools.handleExecute}
        onReject={tools.handleReject}
        onExecuteAll={tools.handleExecuteAll}
        onRejectAll={tools.handleRejectAll}
        disabled={permissionUpdatePending}
      />
      <ToolCallLimitModal limit={tools.toolCallLimit} onDecision={tools.handleLimitDecision} disabled={permissionUpdatePending} />
    </>
  );
}

export default MessagesSection;

function mergeMessageDispatchers(
  chatDispatcher: Parameters<typeof useMessageHandler>[1],
  toolDispatcher: Parameters<typeof useMessageHandler>[1],
): Parameters<typeof useMessageHandler>[1] {
  return {
    ...chatDispatcher,
    ...toolDispatcher,
    onStreamDone: (info) => {
      chatDispatcher.onStreamDone?.(info);
      toolDispatcher.onStreamDone?.(info);
    },
    onClearChat: () => {
      chatDispatcher.onClearChat?.();
      toolDispatcher.onClearChat?.();
    },
  };
}
