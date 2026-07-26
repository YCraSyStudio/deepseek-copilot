import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ChatView.css";
import "@vscode/codicons/dist/codicon.css";
import { InputCtrls, InputFooter, MessagesSection } from "./sections";
import { useChatConfig } from "./hooks";
import type { ApiKeyStatus, ChatMessage } from "./ChatViewTypes";
import { getVsCodeApi } from "@webview/VsCodeApi";
import type { Conversation, PermissionMode, WorkspaceContextStatus } from "@/adapters";
import type { GenerationSnapshot } from "@/adapters";
import { t } from "@webview/i18n";

interface ReferencedFile {
  path: string;
  name: string;
  content?: string;
  language?: string;
  type: "file" | "directory";
  size?: number;
  referenceId?: string;
  scope?: "workspace" | "external-snapshot";
  rootUri?: string;
  bindingRevision?: string;
}

type ChatCommandMessage =
  | { type: "addReferencedFiles"; files: ReferencedFile[] }
  | { type: "setDraft"; text: string }
  | { type: "activeConversationChanged"; id: string }
  | { type: "generationAccepted"; generationId: string; conversationId: string }
  | { type: "streamDone"; generationId?: string; conversationId?: string }
  | { type: "streamError"; generationId?: string; conversationId?: string }
  | { type: "workspaceContextChanged"; context: WorkspaceContextStatus }
  | { type: "workspaceRebindResult"; success: boolean; context?: WorkspaceContextStatus; error?: string }
  | { type: "contextFilesSelected"; files: ReferencedFile[] }
  | { type: "generationSnapshot"; generations: GenerationSnapshot[]; recoveredDrafts: Array<{ conversationId: string; messages: Array<{ clientRequestId: string; text: string }> }> };

interface ChatViewState {
  schemaVersion: 2;
  draft: string;
  referencedFiles: ReferencedFile[];
  messages: ChatMessage[];
  conversationId?: string;
}

interface ChatViewProps {
  loadedConversation?: Conversation | null;
}

function ChatView({ loadedConversation }: ChatViewProps) {
  const savedState = getSavedChatState();
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>("missing");
  const [isProcessing, setIsProcessing] = useState(false);
  const [draft, setDraft] = useState(loadedConversation ? "" : (savedState?.draft ?? ""));
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>(loadedConversation ? [] : (savedState?.referencedFiles ?? []));
  const [messages, setMessages] = useState<ChatMessage[]>(loadedConversation?.messages ?? savedState?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | undefined>(loadedConversation?.id ?? savedState?.conversationId);
  const [activeGenerationId, setActiveGenerationId] = useState<string | undefined>();
  const [recoveredDrafts, setRecoveredDrafts] = useState<Array<{ clientRequestId: string; text: string }>>([]);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextStatus>();
  const lastSubmittedPromptRef = useRef("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    selectedModel,
    reasoning,
    permissionMode,
    isPermissionUpdatePending,
    configUpdateError,
    selectedModelRef,
    reasoningRef,
    applySavedConfig,
    applyConfigUpdateResult,
    handleReasoningChange,
    handleModelChange,
    handlePermissionModeChange,
  } = useChatConfig();

  const handleConfigLoaded = useMemo(
    () => (config: { revision: number; reasoning?: string; model?: string; permissionMode?: PermissionMode }) => {
      applySavedConfig(config, config.revision);
    },
    [applySavedConfig],
  );

  const handleModelChanged = useMemo(
    () => (modelId: string) => {
      applySavedConfig({ model: modelId });
    },
    [applySavedConfig],
  );

  const focusInput = () => {
    textareaRef.current?.focus();
  };

  const handleSend = (text: string) => {
    lastSubmittedPromptRef.current = text;
    setReferencedFiles([]);
  };

  const removeFile = useCallback((index: number) => {
    setReferencedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  const appendReferencedFiles = useCallback((files: ReferencedFile[]) => {
    setReferencedFiles((currentFiles) => mergeReferencedFiles(currentFiles, files));
    requestAnimationFrame(focusInput);
  }, []);

  const handleGenerationCancelled = () => {
    const lastSubmittedPrompt = lastSubmittedPromptRef.current;
    setDraft((currentDraft) => currentDraft.trim() ? currentDraft : lastSubmittedPrompt);
    requestAnimationFrame(focusInput);
  };

  const canSend = useMemo(() => {
    const trimmedDraft = draft.trim();
    const workspaceReady = workspaceContext?.state === "connected" || workspaceContext?.state === "empty";
    return !isPermissionUpdatePending &&
      trimmedDraft.length > 0 &&
      (apiKeyStatus === "configured" || trimmedDraft.startsWith("/")) &&
      (workspaceReady || trimmedDraft.startsWith("/"));
  }, [draft, apiKeyStatus, isPermissionUpdatePending, workspaceContext]);

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    getVsCodeApi()?.postMessage({ type: "getWorkspaceContext", conversationId });
  }, [conversationId]);

  useEffect(() => {
    const vscode = getVsCodeApi();
    vscode?.setState<ChatViewState>({
      schemaVersion: 2,
      draft,
      referencedFiles: referencedFiles.filter((file) => file.scope !== "external-snapshot"),
      messages,
      conversationId,
    });
  }, [draft, referencedFiles, messages, conversationId]);

  useEffect(() => {
    const vscode = getVsCodeApi();
    if (!vscode) {return;}

    const handleMessage = (event: MessageEvent<ChatCommandMessage>) => {
      const message = event.data;
      if (message.type === "addReferencedFiles" || message.type === "contextFilesSelected") {
        appendReferencedFiles(message.files);
      }
      if (message.type === "setDraft") {
        setDraft(message.text);
        requestAnimationFrame(focusInput);
      }
      if (message.type === "activeConversationChanged") {
        setConversationId(message.id);
      }
      if (message.type === "workspaceContextChanged") {
        setWorkspaceContext((previous) => {
          if (previous?.binding.revision && previous.binding.revision !== message.context.binding.revision) {
            setReferencedFiles((files) => files.filter((file) => file.scope === "external-snapshot"));
          }
          return message.context;
        });
      }
      if (message.type === "workspaceRebindResult" && message.success && message.context) {
        setReferencedFiles([]);
        setWorkspaceContext(message.context);
      }
      if (message.type === "generationAccepted" && message.conversationId === conversationId) {
        setActiveGenerationId(message.generationId);
      }
      if ((message.type === "streamDone" || message.type === "streamError") && message.generationId === activeGenerationId) {
        setActiveGenerationId(undefined);
      }
      if (message.type === "generationSnapshot") {
        const active = conversationId ? message.generations.find((generation) => generation.conversationId === conversationId) : undefined;
        if (active) {
          setActiveGenerationId(active.generationId);
          setIsProcessing(true);
          setMessages((current) => {
            const withoutPriorSnapshot = current.filter((item) => item.generationId !== active.generationId || item.role === "user");
            if (!active.content && active.timeline.length === 0 && active.toolCalls.length === 0) {
              return withoutPriorSnapshot;
            }
            return [...withoutPriorSnapshot, {
              id: `active-${active.generationId}`,
              role: "assistant",
              content: active.content,
              timeline: active.timeline,
              toolCalls: active.toolCalls,
              generationId: active.generationId,
            }];
          });
        }
        const recovered = conversationId ? message.recoveredDrafts.find((entry) => entry.conversationId === conversationId) : undefined;
        if (recovered?.messages.length) {
          setRecoveredDrafts(recovered.messages);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [appendReferencedFiles, conversationId, activeGenerationId]);

  return (
    <div className="chatView">
      <MessagesSection
        conversationId={conversationId}
        messages={messages}
        onMessagesChange={setMessages}
        onApiKeyStatusChange={setApiKeyStatus}
        onConfigLoaded={handleConfigLoaded}
        onConfigUpdateResult={applyConfigUpdateResult}
        permissionUpdatePending={isPermissionUpdatePending}
        onModelChanged={handleModelChanged}
        onProcessingChange={setIsProcessing}
        onFocusInput={focusInput}
        onGenerationCancelled={handleGenerationCancelled}
      />
      {apiKeyStatus === "missing" ? <div className="statusMessage warning">{t("chat.apiKeyMissing")}</div> : null}
      {isPermissionUpdatePending ? <div className="statusMessage" role="status" aria-live="polite">{t("chat.applyingPermissions")}</div> : null}
      {configUpdateError ? <div className="statusMessage warning" role="alert">{configUpdateError}</div> : null}

      <div className="inputArea">
        {recoveredDrafts.length > 0 ? (
          <div className="statusMessage">
            {t("chat.recoveredDrafts")}
            {recoveredDrafts.map((item, index) => (
              <button
                key={`${index}-${item.text.slice(0, 24)}`}
                type="button"
                onClick={() => {
                  setDraft(item.text);
                  setRecoveredDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  if (conversationId) {
                    getVsCodeApi()?.postMessage({
                      type: "consumeRecoveredDraft",
                      conversationId,
                      clientRequestId: item.clientRequestId,
                    });
                  }
                }}
              >
                {t("chat.restoreDraft")}: {item.text.slice(0, 48)}
              </button>
            ))}
          </div>
        ) : null}
        <InputCtrls
          ref={textareaRef}
          input={draft}
          setInput={setDraft}
          isProcessing={isProcessing}
          canSend={canSend}
          selectedModelRef={selectedModelRef}
          reasoningRef={reasoningRef}
          placeholder={apiKeyStatus === "configured" ? t("chat.askAnythingAboutYourCode") : t("chat.configureApiKey")}
          rows={1}
          referencedFiles={referencedFiles}
          conversationId={conversationId}
          workspaceRevision={workspaceContext?.binding.revision}
          activeGenerationId={activeGenerationId}
          onSend={handleSend}
        />
        <InputFooter
          reasoning={reasoning}
          selectedModel={selectedModel}
          permissionMode={permissionMode}
          permissionUpdatePending={isPermissionUpdatePending}
          onModelChange={handleModelChange}
          onReasoningChange={handleReasoningChange}
          onPermissionModeChange={handlePermissionModeChange}
          referencedFiles={referencedFiles}
          onRemoveReferencedFile={removeFile}
          workspaceContext={workspaceContext}
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}

function getSavedChatState(): ChatViewState | undefined {
  const state = getVsCodeApi()?.getState<Partial<ChatViewState>>();
  if (!state || typeof state !== "object" || state.schemaVersion !== 2) {
    return undefined;
  }

  return {
    schemaVersion: 2,
    draft: typeof state.draft === "string" ? state.draft : "",
    referencedFiles: Array.isArray(state.referencedFiles)
      ? state.referencedFiles.filter(isReferencedFile).filter((file) => file.scope !== "external-snapshot")
      : [],
    messages: Array.isArray(state.messages) ? (state.messages as ChatMessage[]) : [],
    conversationId: typeof state.conversationId === "string" && state.conversationId.trim() ? state.conversationId : undefined,
  };
}

function isReferencedFile(value: unknown): value is ReferencedFile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const file = value as Partial<ReferencedFile>;
  return typeof file.path === "string" && typeof file.name === "string" && (file.type === "file" || file.type === "directory");
}

function mergeReferencedFiles(currentFiles: ReferencedFile[], newFiles: ReferencedFile[]): ReferencedFile[] {
  const seen = new Set(currentFiles.map((file) => file.path));
  const uniqueNewFiles = newFiles.filter((file) => {
    if (seen.has(file.path)) {
      return false;
    }
    seen.add(file.path);
    return true;
  });
  return [...currentFiles, ...uniqueNewFiles];
}

export default ChatView;
