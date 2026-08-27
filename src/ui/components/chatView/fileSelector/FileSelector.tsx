import { useEffect, useRef } from "react";
import type { PathCompletionItem } from "@/contracts";
import "./FileSelector.css";
import { t } from "@webview/i18n";

export { getPathToken, type PathToken } from "./PathToken";

interface CompletionVisual {
  className: string;
  text?: string;
}

interface FileSelectorProps {
  activeIndex: number;
  completions: PathCompletionItem[];
  isOpen: boolean;
  onSelect: (completion: PathCompletionItem) => void;
  listboxId: string;
}

export function FileSelector({ activeIndex, completions, isOpen, onSelect, listboxId }: FileSelectorProps) {
  const completionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    completionItemRefs.current = completionItemRefs.current.slice(0, completions.length);
    completionItemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, completions.length]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="pathCompletionPopup"
      id={listboxId}
      role={completions.length > 0 ? "listbox" : "status"}
      aria-label={t("chat.workspacePathSuggestions")}
    >
      {completions.length > 0 ? (
        completions.map((completion, index) => (
          <button
            key={`${completion.type}:${completion.path}`}
            ref={(element) => {
              completionItemRefs.current[index] = element;
            }}
            type="button"
            className={`pathCompletionItem${index === activeIndex ? " active" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(completion);
            }}
            role="option"
            tabIndex={-1}
            id={`path-completion-option-${index}`}
            aria-selected={index === activeIndex}
          >
            <CompletionIcon completion={completion} />
            <span className="pathCompletionLabel">{completion.label}</span>
          </button>
        ))
      ) : (
        <div className="pathCompletionEmpty">
          <span className="codicon codicon-folder-opened" aria-hidden="true" />
          <span>{t("chat.noFilesOrFoldersFound")}</span>
        </div>
      )}
    </div>
  );
}

function CompletionIcon({ completion }: { completion: PathCompletionItem }) {
  const visual = getCompletionVisual(completion);
  return (
    <span className={`pathCompletionIcon ${visual.className}`} aria-hidden="true">
      {visual.text}
    </span>
  );
}

function getCompletionVisual(completion: PathCompletionItem): CompletionVisual {
  if (completion.type === "directory") {
    return { className: "codicon codicon-folder folder" };
  }

  const extension = completion.label.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { className: "textIcon js", text: "JS" };
    case "ts":
    case "tsx":
    case "cs":
    case "java":
    case "kt":
    case "kts":
    case "go":
    case "rs":
    case "py":
    case "rb":
    case "php":
    case "swift":
    case "c":
    case "h":
    case "cpp":
    case "hpp":
    case "cc":
    case "csproj":
    case "fs":
    case "fsx":
      return { className: "codicon codicon-package object" };
    case "json":
    case "jsonc":
      return { className: "codicon codicon-json json" };
    case "html":
    case "htm":
    case "xml":
    case "svg":
      return { className: "codicon codicon-code html" };
    case "css":
    case "scss":
    case "sass":
    case "less":
      return { className: "textIcon css", text: "#" };
    case "md":
    case "mdx":
      return { className: "codicon codicon-markdown markdown" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
      return { className: "codicon codicon-file-media media" };
    case "lock":
      return { className: "codicon codicon-lock lock" };
    default:
      return { className: "codicon codicon-file-code file" };
  }
}
