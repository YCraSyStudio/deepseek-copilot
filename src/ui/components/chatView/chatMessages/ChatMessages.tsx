import React from "react";
import rehypeSanitize from "rehype-sanitize";
import { refractor } from "refractor";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeAssistantMarkdown } from "@/shared/utils";
import type { AssistantTimelineEvent } from "@/adapters";
import type { ChatMessage, ToolCallGroup } from "@webview/views/chatView/ChatViewTypes";
import "../../shared/collapsiblePanel/CollapsiblePanel.css";
import "./ChatMessages.css";
import { t } from "@webview/i18n";

interface ChatMessagesProps {
  messages: ChatMessage[];
  renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode;
  activeToolCallGroups?: ToolCallGroup[];
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: {
    className?: string[] | string;
  };
  children?: HastNode[];
};

function ChatMessages({ messages, renderToolCallGroups, activeToolCallGroups = [] }: ChatMessagesProps) {
  return (
    <>
      {messages.map((message, messageIndex) => {
        const isLastAssistant = message.role === "assistant" && messageIndex === messages.length - 1;
        const toolCallGroups = mergeToolCallGroups(buildMessageToolCallGroups(message), isLastAssistant ? activeToolCallGroups : []);

        return (
          <React.Fragment key={message.id}>
            <article className={`message ${message.role}`}>
              <div className={message.role === "error" ? "errorMessage" : "messageContent"}>
                <MessageBody message={message} toolCallGroups={toolCallGroups} renderToolCallGroups={renderToolCallGroups} />
              </div>
            </article>
          </React.Fragment>
        );
      })}
    </>
  );
}

function MessageBody({ message, toolCallGroups, renderToolCallGroups }: { message: ChatMessage; toolCallGroups: ToolCallGroup[]; renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode }) {
  if (message.role === "error") {
    return <p>{message.content}</p>;
  }

  if (message.role === "assistant") {
    return <AssistantTimeline timeline={message.timeline ?? []} toolCallGroups={toolCallGroups} renderToolCallGroups={renderToolCallGroups} />;
  }

  return <PlainText content={message.content} />;
}

function AssistantTimeline({ timeline, toolCallGroups, renderToolCallGroups }: { timeline: AssistantTimelineEvent[]; toolCallGroups: ToolCallGroup[]; renderToolCallGroups?: (groups: ToolCallGroup[]) => React.ReactNode }) {
  return (
    <div className="chronologicalAssistant">
      {timeline.map((event) => {
        if (event.type === "tool-group") {
          const group = findTimelineToolGroup(event, toolCallGroups);
          return group ? <React.Fragment key={event.id}>{renderToolCallGroups?.([group])}</React.Fragment> : null;
        }
        if (event.type === "reasoning") {
          return event.content ? <ReasoningPanel key={event.id} eventId={event.id} content={event.content} /> : null;
        }
        return event.content ? <MarkdownMessage key={event.id} content={event.content} role="assistant" /> : null;
      })}
    </div>
  );
}

function ReasoningPanel({ eventId, content }: { eventId: string; content: string }) {
  const storageKey = `deepseek.reasoning.expanded.${eventId}`;
  const [open, setOpen] = React.useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = event.currentTarget.open;
    setOpen(isOpen);
    try {
      window.localStorage.setItem(storageKey, String(isOpen));
    } catch {
      // The panel still works when webview storage is unavailable.
    }
  };

  return (
    <details className="collapsiblePanel reasoning-block" open={open} onToggle={handleToggle}>
      <summary className="collapsiblePanelSummary">
        <span className="collapsiblePanelTitle">{t("chat.reasoning")}</span>
        <span className="collapsiblePanelChevron" aria-hidden="true" />
      </summary>
      <div className="collapsiblePanelBody reasoning-content">
        <div>{content}</div>
      </div>
    </details>
  );
}

function findTimelineToolGroup(
  event: Extract<AssistantTimelineEvent, { type: "tool-group" }>,
  groups: ToolCallGroup[],
): ToolCallGroup | undefined {
  const group = groups.find((candidate) => candidate.round === event.round);
  if (!group) {
    return undefined;
  }
  const ids = new Set(event.toolCallIds);
  return { ...group, toolCalls: group.toolCalls.filter((toolCall) => ids.has(toolCall.toolCallId)) };
}

function PlainText({ content }: { content: string }) {
  return (
    <>
      {content.split("\n").map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </React.Fragment>
      ))}
    </>
  );
}

function MarkdownMessage({ content, role }: { content: string; role: ChatMessage["role"] }) {
  const markdown = normalizeAssistantMarkdown(content);

  return (
    <div className="markdownMessage">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ className, children, ...props }) {
            const languageId = getLanguageId(className);
            const languageLabel = getLanguageLabel(languageId);
            const rawCode = extractText(children);
            const code = rawCode.replace(/\n$/, "");
            const isInline = !className && !rawCode.includes("\n");

            if (isInline) {
              return (
                <code className="inline-code" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <div className="code-block" data-code-text={code}>
                <div className="code-block-header">
                  <span className="lang-label">{languageLabel}</span>
                  <span className="code-actions">
                    <button type="button" className="code-action-btn" data-code-action="copy">
                      {t("tools.copy")}
                    </button>
                    {role === "assistant" ? (
                      <button type="button" className="code-action-btn" data-code-action="insert">
                        {t("tools.insert")}
                      </button>
                    ) : null}
                  </span>
                </div>
                <RefractorCode code={code} className={className} language={languageId} codeProps={props} />
              </div>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function RefractorCode({ code, className, language, codeProps }: { code: string; className?: string; language: string; codeProps: React.ComponentProps<"code"> }) {
  let children: React.ReactNode;

  try {
    const tree = refractor.highlight(code, normalizeRefractorLanguage(language)) as HastNode;
    children = tree.children?.map((node, index) => renderHastNode(node, index)) ?? code;
  } catch {
    children = code;
  }

  return (
    <code className={className} {...codeProps}>
      {children}
    </code>
  );
}

function renderHastNode(node: HastNode, key: React.Key): React.ReactNode {
  if (node.type === "text") {
    return node.value ?? "";
  }

  if (node.type !== "element") {
    return null;
  }

  const className = Array.isArray(node.properties?.className) ? node.properties.className.join(" ") : node.properties?.className;

  return (
    <span key={key} className={className}>
      {node.children?.map((child, index) => renderHastNode(child, index))}
    </span>
  );
}

function extractText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(extractText).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return extractText(value.props.children);
  }
  return "";
}

function getLanguageId(className?: string): string {
  return className?.match(/language-([^\s]+)/)?.[1] || "text";
}

function getLanguageLabel(language: string): string {
  const labels: Record<string, string> = {
    "c#": "C#",
    cs: "C#",
    csharp: "C#",
    js: "JavaScript",
    javascript: "JavaScript",
    ts: "TypeScript",
    typescript: "TypeScript",
    html: "HTML",
    css: "CSS",
    json: "JSON",
    bash: "Bash",
    shell: "Shell",
    sh: "Shell",
    python: "Python",
    py: "Python",
  };
  return labels[language.toLowerCase()] || language;
}

function normalizeRefractorLanguage(language: string): string {
  const aliases: Record<string, string> = {
    "c#": "csharp",
    cs: "csharp",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    sh: "bash",
    shell: "bash",
    ts: "typescript",
    tsx: "tsx",
    yml: "yaml",
  };
  return aliases[language.toLowerCase()] || language.toLowerCase();
}

function buildMessageToolCallGroups(message: ChatMessage): ToolCallGroup[] {
  if (!message.toolCalls?.length) {
    return [];
  }

  const grouped = new Map<number, ToolCallGroup>();
  message.toolCalls.forEach((toolCall) => {
    if (!toolCall.round || toolCall.round <= 0 || !toolCall.toolCallId) {
      return;
    }
    const round = toolCall.round;
    if (!grouped.has(round)) {
      grouped.set(round, {
        id: `tool-message-${message.id}-round-${round}`,
        round,
        expanded: false,
        toolCalls: [],
      });
    }

    grouped.get(round)!.toolCalls.push({
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      arguments: toolCall.arguments,
      status: toolCall.status,
      result: toolCall.result,
      round,
      requiresConfirmation: toolCall.requiresConfirmation ?? false,
      dangerLevel: toolCall.dangerLevel,
      dangerConfirmed: toolCall.dangerConfirmed,
      dangerConfirmation: toolCall.dangerConfirmation,
    });
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group);
}

function mergeToolCallGroups(storedGroups: ToolCallGroup[], activeGroups: ToolCallGroup[]): ToolCallGroup[] {
  const groups = new Map(storedGroups.map((group) => [group.round, group]));
  for (const activeGroup of activeGroups) {
    const storedGroup = groups.get(activeGroup.round);
    if (!storedGroup) {
      groups.set(activeGroup.round, activeGroup);
      continue;
    }

    const calls = new Map(storedGroup.toolCalls.map((toolCall) => [toolCall.toolCallId, toolCall]));
    for (const toolCall of activeGroup.toolCalls) {
      calls.set(toolCall.toolCallId, toolCall);
    }
    groups.set(activeGroup.round, { ...storedGroup, toolCalls: [...calls.values()] });
  }
  return [...groups.values()].sort((a, b) => a.round - b.round);
}

export default ChatMessages;
