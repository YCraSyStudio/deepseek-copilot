import type React from "react";
import { aggregateUsageAggregates } from "@/shared/usage/Usage";
import type { ChatMessage, ToolCallGroup } from "@webview/views/chatView/ChatViewTypes";
import "../../shared/collapsiblePanel/CollapsiblePanel.css";
import "./ChatMessages.css";
import { AssistantActivity } from "./AssistantActivity";
import { PlainText } from "./MarkdownMessage";
import UsageBreakdown from "./UsageBreakdown";
import { t } from "@webview/i18n";
import {
  buildMessageToolCallGroups,
  mergeToolCallGroups,
} from "./ToolCallReconciliation";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isProcessing?: boolean;
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  activeToolCallGroups?: ToolCallGroup[];
  showUsageBreakdown?: boolean;
}

function ChatMessages({
  messages,
  isProcessing = false,
  renderToolCallGroups,
  activeToolCallGroups = [],
  showUsageBreakdown = false,
}: ChatMessagesProps) {
  const conversationUsage = aggregateUsageAggregates(
    messages.flatMap((message) => message.usage ? [message.usage] : []),
  );
  return (
    <>
      {messages.map((message, messageIndex) => {
        const isLastAssistant =
          message.role === "assistant" &&
          messageIndex === messages.length - 1;
        const toolCallGroups = mergeToolCallGroups(
          buildMessageToolCallGroups(message),
          isLastAssistant ? activeToolCallGroups : [],
        );

        return (
          <div key={message.id} className={`message ${message.role}`}>
            <MessageBody
              message={message}
              isActive={isLastAssistant && isProcessing}
              toolCallGroups={toolCallGroups}
              renderToolCallGroups={renderToolCallGroups}
              showUsageBreakdown={showUsageBreakdown}
            />
          </div>
        );
      })}
      {showUsageBreakdown && conversationUsage ? <UsageBreakdown usage={conversationUsage} scope="conversation" /> : null}
    </>
  );
}

function MessageBody({
  message,
  isActive,
  toolCallGroups,
  renderToolCallGroups,
  showUsageBreakdown,
}: {
  message: ChatMessage;
  isActive: boolean;
  toolCallGroups: ToolCallGroup[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  showUsageBreakdown: boolean;
}) {
  if (message.role === "error") {
    return <div className="errorMessage">{message.content}</div>;
  }
  if (message.role === "context") {
    return <div className="contextCompactionMarker"><span aria-hidden="true">⇄</span> {t("chat.contextAutomaticallyCompacted")}</div>;
  }
  if (message.role === "assistant") {
    return (
      <>
        <AssistantActivity
          timeline={message.timeline ?? []}
          toolCallGroups={toolCallGroups}
          renderToolCallGroups={renderToolCallGroups}
          isActive={isActive}
          generationStatus={message.generationStatus}
          generationStopReason={message.generationStopReason}
        />
        {showUsageBreakdown && message.usage ? <UsageBreakdown usage={message.usage} /> : null}
      </>
    );
  }
  if (message.role === "user") {
    return (
      <div className="messageContent">
        {message.imageAttachments?.length ? (
          <div className="messageImages">
            {message.imageAttachments.map((attachment) => attachment.previewUri
              ? <img key={attachment.id} src={attachment.previewUri} alt={attachment.name} title={attachment.name} />
              : <span key={attachment.id} className="messageImageFallback"><span className="codicon codicon-file-media" /> {attachment.name}</span>)}
          </div>
        ) : null}
        {message.content ? <PlainText content={message.content} /> : null}
      </div>
    );
  }
  return <PlainText content={message.content} />;
}

export default ChatMessages;
