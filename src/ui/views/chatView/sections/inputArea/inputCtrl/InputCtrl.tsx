import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { WEBVIEW_INPUT_LIMITS, type HandlerToWebviewMessage, type PathCompletionItem, type ReferencedFile } from "@/adapters";
import "./InputCtrl.css";
import { FileSelector, getPathToken, type PathToken } from "@webview/components/chatView";
import { useVsCode } from "@webview/views/chatView/contexts";
import { t } from "@webview/i18n";

type Props = {
  input: string;
  setInput: (input: string) => void;
  isProcessing?: boolean;
  canSend?: boolean;
  selectedModelRef: { current: string };
  reasoningRef: { current: string };
  placeholder?: string;
  rows?: number;
  referencedFiles?: ReferencedFile[];
  conversationId?: string;
  workspaceRevision?: string;
  activeGenerationId?: string;
  onSend?: (text: string, clientRequestId: string) => void;
};

const InputCtrl = forwardRef<HTMLTextAreaElement, Props>(
  (
    {
      input,
      setInput,
      isProcessing = false,
      canSend = true,
      selectedModelRef,
      reasoningRef,
      placeholder = "Type your message here...",
      rows = 1,
      referencedFiles,
      conversationId,
      workspaceRevision,
      activeGenerationId,
      onSend,
    },
    ref,
  ) => {
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const requestIdRef = useRef(0);
    const activeRequestIdRef = useRef(0);
    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCompletionQueryRef = useRef<string | null>(null);
    const vscode = useVsCode();
    const [pathToken, setPathToken] = useState<PathToken | null>(null);
    const [completions, setCompletions] = useState<PathCompletionItem[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [hasCompletionResponse, setHasCompletionResponse] = useState(false);

    useImperativeHandle(ref, () => taRef.current!, [taRef]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent<HandlerToWebviewMessage>) => {
        const message = event.data;
        if (
          message.type !== "pathCompletions" ||
          message.requestId !== activeRequestIdRef.current ||
          (workspaceRevision && message.workspaceRevision !== workspaceRevision)
        ) {
          return;
        }

        const uniqueItems = message.items.filter(
          (item, index, items) => items.findIndex((candidate) => candidate.path === item.path && candidate.type === item.type) === index,
        );
        setCompletions(uniqueItems);
        setActiveIndex(0);
        setHasCompletionResponse(true);
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [workspaceRevision]);

    useEffect(() => () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
    }, []);

    const requestPathCompletions = useCallback(
      (value: string, cursor: number, immediate = false) => {
        const token = getPathToken(value, cursor);
        setPathToken(token);

        if (completionTimerRef.current) {
          clearTimeout(completionTimerRef.current);
          completionTimerRef.current = null;
        }

        if (!token || !vscode) {
          setCompletions([]);
          setHasCompletionResponse(false);
          lastCompletionQueryRef.current = null;
          activeRequestIdRef.current = requestIdRef.current + 1;
          requestIdRef.current = activeRequestIdRef.current;
          return;
        }

        if (lastCompletionQueryRef.current === token.query) {
          return;
        }

        lastCompletionQueryRef.current = token.query;
        setCompletions([]);
        setHasCompletionResponse(false);
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        activeRequestIdRef.current = requestId;
        const sendRequest = () => {
          vscode.postMessage({ type: "getPathCompletions", requestId, query: token.query, conversationId, workspaceRevision });
        };

        if (immediate) {
          sendRequest();
        } else {
          completionTimerRef.current = setTimeout(sendRequest, 140);
        }
      },
      [vscode, conversationId, workspaceRevision],
    );

    const handleSend = useCallback(() => {
      const text = input.trim();
      if (!text || !vscode || !canSend) {
        return;
      }

      setCompletions([]);
      setPathToken(null);
      const clientRequestId = crypto.randomUUID();
      onSend?.(text, clientRequestId);
      vscode.postMessage({
        type: "sendMessage",
        clientRequestId,
        text,
        modelId: selectedModelRef.current,
        reasoning: reasoningRef.current,
        conversationId,
        workspaceRevision,
        referencedFiles: referencedFiles?.map(toRequestReference),
      });
    }, [input, vscode, canSend, selectedModelRef, reasoningRef, referencedFiles, conversationId, workspaceRevision, onSend]);

    const handleCancel = useCallback(() => {
      if (activeGenerationId) {
        vscode?.postMessage({ type: "cancelGeneration", generationId: activeGenerationId });
      }
    }, [vscode, activeGenerationId]);

    const handleSteer = useCallback(() => {
      const text = input.trim();
      if (!text || !vscode || !conversationId || !activeGenerationId) {
        return;
      }
      const clientRequestId = crypto.randomUUID();
      onSend?.(text, clientRequestId);
      vscode.postMessage({
        type: "steerGeneration",
        generationId: activeGenerationId,
        clientRequestId,
        text,
        modelId: selectedModelRef.current,
        reasoning: reasoningRef.current,
        conversationId,
        workspaceRevision,
        referencedFiles: referencedFiles?.map(toRequestReference),
      });
    }, [activeGenerationId, conversationId, input, onSend, reasoningRef, referencedFiles, selectedModelRef, vscode, workspaceRevision]);

    const insertCompletion = useCallback(
      (completion: PathCompletionItem) => {
        if (!pathToken) {
          return;
        }

        const textarea = taRef.current;
        const nextInput = `${input.slice(0, pathToken.start)}${completion.path}${input.slice(pathToken.end)}`;
        const cursor = pathToken.start + completion.path.length;
        setInput(nextInput);

        requestAnimationFrame(() => {
          if (!textarea) {
            return;
          }
          textarea.selectionStart = cursor;
          textarea.selectionEnd = cursor;
          textarea.focus();
          if (completion.type === "directory") {
            lastCompletionQueryRef.current = null;
            requestPathCompletions(nextInput, cursor, true);
          } else {
            setCompletions([]);
            setPathToken(null);
          }
        });
      },
      [input, pathToken, requestPathCompletions, setInput],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (completions.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((index) => (index + 1) % completions.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((index) => (index - 1 + completions.length) % completions.length);
            return;
          }
          if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
            insertCompletion(completions[activeIndex]);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setCompletions([]);
            setPathToken(null);
            return;
          }
        }

        if (e.key === "Enter" && !e.shiftKey && canSend) {
          e.preventDefault();
          handleSend();
        }
      },
      [activeIndex, canSend, completions, handleSend, insertCompletion],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        requestPathCompletions(e.target.value, e.target.selectionStart);
      },
      [requestPathCompletions, setInput],
    );

    const handleCursorChange = useCallback(() => {
      const textarea = taRef.current;
      if (textarea) {
        requestPathCompletions(input, textarea.selectionStart);
      }
    }, [input, requestPathCompletions]);

    return (
      <div className="inputCtrl">
        <FileSelector
          activeIndex={activeIndex}
          completions={completions}
          isOpen={Boolean(pathToken) && hasCompletionResponse}
          onSelect={insertCompletion}
          listboxId="path-completion-listbox"
        />

        <span className="srOnly" role="status" aria-live="polite">
          {pathToken && hasCompletionResponse
            ? completions.length > 0
              ? t("chat.pathSuggestionCount", { count: completions.length })
              : t("chat.noFilesOrFoldersFound")
            : ""}
        </span>

        <textarea
          ref={taRef}
          className="Input"
          placeholder={placeholder}
          value={input}
          onChange={handleChange}
          onClick={handleCursorChange}
          onKeyDown={handleKeyDown}
          rows={rows}
          aria-label={t("chat.chatMessage")}
          aria-autocomplete="list"
          aria-expanded={completions.length > 0 && Boolean(pathToken)}
          aria-controls={completions.length > 0 ? "path-completion-listbox" : undefined}
          aria-activedescendant={completions.length > 0 ? `path-completion-option-${activeIndex}` : undefined}
          aria-busy={isProcessing}
          maxLength={WEBVIEW_INPUT_LIMITS.chatText}
        />
        {isProcessing ? (
          <>
            <button className="stopBtn inside" type="button" onClick={handleCancel} aria-label={t("chat.stopGeneration")} data-tooltip={t("chat.stopGeneration")}>
              <span className="codicon codicon-debug-stop" aria-hidden="true" />
            </button>
            <button className="sendBtn inside" type="button" onClick={handleSteer} disabled={!canSend} aria-label={t("chat.interruptAndGuide")} data-tooltip={t("chat.interruptAndGuide")}>
              <span className="codicon codicon-debug-restart" aria-hidden="true" />
            </button>
            <button className="sendBtn inside" type="button" onClick={handleSend} disabled={!canSend} aria-label={t("chat.queueMessage")} data-tooltip={t("chat.queueMessage")}>
              <span className="codicon codicon-list-ordered" aria-hidden="true" />
            </button>
          </>
        ) : (
          <button className="sendBtn inside" type="button" onClick={handleSend} disabled={!canSend} aria-label={t("chat.sendMessage")}>
            <span className="codicon codicon-send" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);

export default InputCtrl;

function toRequestReference(file: ReferencedFile) {
  return {
    path: file.path,
    content: file.content,
    type: file.type,
    referenceId: file.referenceId,
    scope: file.scope,
    rootUri: file.rootUri,
    bindingRevision: file.bindingRevision,
  };
}
