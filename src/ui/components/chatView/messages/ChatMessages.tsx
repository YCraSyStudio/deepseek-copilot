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
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  activeToolCallGroups?: ToolCallGroup[];
}

function ChatMessages({
  messages,
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
  toolCallGroups,
  renderToolCallGroups,
}: {
  message: ChatMessage;
  toolCallGroups: ToolCallGroup[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
}) {
  if (message.role === "error") {
    return <p>{message.content}</p>;
  }
  if (message.role === "assistant") {
    return (
      <AssistantActivity
        timeline={message.timeline ?? []}
        toolCallGroups={toolCallGroups}
        renderToolCallGroups={renderToolCallGroups}
      />
    );
  }
  return <PlainText content={message.content} />;
}

export default ChatMessages;
