import type React from "react";
import type { ChatMessage, ToolCallGroup } from "@webview/views/chatView/ChatViewTypes";
import "../../shared/collapsiblePanel/CollapsiblePanel.css";
import "./ChatMessages.css";
import { AssistantActivity } from "./AssistantActivity";
import { PlainText } from "./MarkdownMessage";
import {
  buildMessageToolCallGroups,
  mergeToolCallGroups,
} from "./ToolCallReconciliation";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isProcessing?: boolean;
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  activeToolCallGroups?: ToolCallGroup[];
}

function ChatMessages({
  messages,
  isProcessing = false,
  renderToolCallGroups,
  activeToolCallGroups = [],
}: ChatMessagesProps) {
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
            />
          </div>
        );
      })}
    </>
  );
}

function MessageBody({
  message,
  isActive,
  toolCallGroups,
  renderToolCallGroups,
}: {
  message: ChatMessage;
  isActive: boolean;
  toolCallGroups: ToolCallGroup[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
}) {
  if (message.role === "error") {
    return <div className="errorMessage">{message.content}</div>;
  }
  if (message.role === "assistant") {
    return (
      <AssistantActivity
        timeline={message.timeline ?? []}
        toolCallGroups={toolCallGroups}
        renderToolCallGroups={renderToolCallGroups}
        isActive={isActive}
        generationStatus={message.generationStatus}
      />
    );
  }
  if (message.role === "user") {
    return <div className="messageContent"><PlainText content={message.content} /></div>;
  }
  return <PlainText content={message.content} />;
}

export default ChatMessages;
