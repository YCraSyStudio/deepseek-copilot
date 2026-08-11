import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ChatView.css";
import "@vscode/codicons/dist/codicon.css";
import { InputCtrls, InputFooter, MessagesSection } from "./sections";
import { useChatConfig } from "./hooks";
import type { ApiKeyStatus, ChatMessage } from "./ChatViewTypes";
import { getVsCodeApi } from "@webview/VsCodeApi";
import type { Conversation, PermissionMode, QueuedGenerationMessage, ReferencedFile, WorkspaceContextStatus } from "@/contracts";
import type { GenerationSnapshot } from "@/contracts";
import { t } from "@webview/i18n";
import { beginNavigationRequest } from "@webview/NavigationRequests";

type ChatCommandMessage =
  | { type: "addReferencedFiles"; files: ReferencedFile[] }
  | { type: "clearChat" }
  | { type: "setDraft"; text: string }
  | { type: "generationAccepted"; generationId: string; conversationId: string; clientRequestId: string }
  | { type: "messageQueued"; conversationId: string; clientRequestId: string; position: number }
  | { type: "requestRejected"; requestId?: string; action?: string; error: string }
  | { type: "protocolError"; supportedVersion: number; error: string }
  | { type: "streamDone"; generationId?: string; conversationId?: string; restoredDraft?: QueuedGenerationMessage }
  | { type: "streamError"; generationId?: string; conversationId?: string }
  | { type: "workspaceContextChanged"; requestId?: string; conversationId?: string; context: WorkspaceContextStatus }
  | { type: "contextFilesSelected"; files: ReferencedFile[] }
  | { type: "generationSnapshot"; generations: GenerationSnapshot[]; recoveredDrafts: Array<{ conversationId: string; messages: QueuedGenerationMessage[] }> };

interface PersistentChatViewState {
  schemaVersion: 4;
  mode: "persistent";
  draft: string;
  referencedFiles: ReferencedFile[];
  conversationId?: string;
}

interface IncognitoChatViewState {
  schemaVersion: 3;
  mode: "incognito";
}

type ChatViewState = PersistentChatViewState | IncognitoChatViewState;

interface ChatViewProps {
  loadedConversation?: Conversation | null;
  navigationPending?: boolean;
}

function ChatView({ loadedConversation, navigationPending = false }: ChatViewProps) {
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>("missing");
  const [isProcessing, setIsProcessing] = useState(false);
  const [draft, setDraft] = useState("");
  const [referencedFiles, setReferencedFiles] = useState<ReferencedFile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(loadedConversation?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | undefined>(loadedConversation?.id);
  const [stateHydrated, setStateHydrated] = useState(false);
  const [activeGenerationId, setActiveGenerationId] = useState<string | undefined>();
  const [recoveredDrafts, setRecoveredDrafts] = useState<QueuedGenerationMessage[]>([]);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextStatus>();
  const lastSubmittedPromptRef = useRef("");
  const conversationIdRef = useRef(conversationId);
  const activeGenerationIdRef = useRef(activeGenerationId);
  const pendingRequestsRef = useRef(new Map<string, { text: string; referenceIds: string[] }>());
  const draftRef = useRef(draft);
  const referencedFilesRef = useRef(referencedFiles);
  const [requestError, setRequestError] = useState<string>();
  const initialConfigHandledRef = useRef(false);
  const workspaceRequestIdRef = useRef<string | undefined>(undefined);
  const workspaceMismatchRef = useRef<string | undefined>(undefined);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    activeGenerationIdRef.current = activeGenerationId;
  }, [activeGenerationId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    referencedFilesRef.current = referencedFiles;
  }, [referencedFiles]);

  const {
    selectedModel,
    reasoning,
    permissionMode,
    historyEnabled,
    isPermissionUpdatePending,
    configUpdateError,
    selectedModelRef,
    reasoningRef,
    applySavedConfig,
    applyConfigUpdateResult,
    handleReasoningChange,
    handleModelChange,
    handlePermissionModeChange,
    usageBreakdown,
  } = useChatConfig();

  const handleConfigLoaded = useMemo(
    () => (config: { revision: number; reasoning?: string; model?: string; permissionMode?: PermissionMode; historyEnabled?: boolean; usageBreakdown?: boolean }) => {
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

  const handleSend = (text: string, clientRequestId: string) => {
    lastSubmittedPromptRef.current = text;
    pendingRequestsRef.current.set(clientRequestId, {
      text,
      referenceIds: referencedFilesRef.current.map(referenceIdentity),
    });
    setRequestError(undefined);
  };

  const removeFile = useCallback((index: number) => {
    setReferencedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  const appendReferencedFiles = useCallback((files: ReferencedFile[]) => {
    setReferencedFiles((currentFiles) => mergeReferencedFiles(currentFiles, files));
    requestAnimationFrame(focusInput);
  }, []);

  const handleGenerationCancelled = (restored?: QueuedGenerationMessage) => {
    const restoredText = restored?.text ?? lastSubmittedPromptRef.current;
    setDraft((currentDraft) => currentDraft.trim() ? currentDraft : restoredText);
    if (restored?.referencedFiles?.length) {
      setReferencedFiles((current) => mergeReferencedFiles(current, restored.referencedFiles!));
    }
    if (restored && conversationIdRef.current) {
      getVsCodeApi()?.postMessage({
        type: "consumeRecoveredDraft",
        conversationId: conversationIdRef.current,
        clientRequestId: restored.clientRequestId,
      });
    }
    requestAnimationFrame(focusInput);
  };

  const canSend = useMemo(() => {
    const trimmedDraft = draft.trim();
    const workspaceReady = workspaceContext?.state === "connected" || workspaceContext?.state === "empty";
    return !navigationPending && !isPermissionUpdatePending &&
      trimmedDraft.length > 0 &&
      (apiKeyStatus === "configured" || trimmedDraft.startsWith("/")) &&
      (workspaceReady || trimmedDraft.startsWith("/"));
  }, [draft, apiKeyStatus, isPermissionUpdatePending, navigationPending, workspaceContext]);

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    workspaceRequestIdRef.current = requestId;
    getVsCodeApi()?.postMessage({ type: "getWorkspaceContext", requestId, conversationId });
  }, [conversationId]);

  useEffect(() => {
    if (
      !conversationId ||
      (workspaceContext?.state !== "changed" && workspaceContext?.state !== "disconnected")
    ) {
      workspaceMismatchRef.current = undefined;
      return;
    }
    const mismatch = `${conversationId}:${workspaceContext.binding.revision}`;
    if (workspaceMismatchRef.current === mismatch) {return;}
    workspaceMismatchRef.current = mismatch;
    getVsCodeApi()?.postMessage({ type: "newConversation", requestId: beginNavigationRequest() });
  }, [conversationId, workspaceContext]);

  useEffect(() => {
    if (historyEnabled === undefined) {
      return;
    }
    const vscode = getVsCodeApi();
    if (!initialConfigHandledRef.current) {
      initialConfigHandledRef.current = true;
      if (historyEnabled && !loadedConversation) {
        const savedState = getSavedChatState();
        if (savedState) {
          setDraft(savedState.draft);
          setReferencedFiles(savedState.referencedFiles);
          setConversationId(savedState.conversationId);
        }
      }
    }
    if (!historyEnabled) {
      vscode?.setState<IncognitoChatViewState>({ schemaVersion: 3, mode: "incognito" });
    }
    setStateHydrated(true);
  }, [historyEnabled, loadedConversation]);

  useEffect(() => {
    const vscode = getVsCodeApi();
    if (!stateHydrated || historyEnabled === undefined) {
      return;
    }
    if (!historyEnabled) {
      vscode?.setState<IncognitoChatViewState>({ schemaVersion: 3, mode: "incognito" });
      return;
    }
    vscode?.setState<PersistentChatViewState>({
      schemaVersion: 4,
      mode: "persistent",
      draft,
      referencedFiles: referencedFiles.filter((file) => file.scope !== "external-snapshot"),
      conversationId,
    });
  }, [draft, referencedFiles, conversationId, historyEnabled, stateHydrated]);

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
      if (message.type === "clearChat") {
        conversationIdRef.current = undefined;
        activeGenerationIdRef.current = undefined;
        pendingRequestsRef.current.clear();
        lastSubmittedPromptRef.current = "";
        setConversationId(undefined);
        setActiveGenerationId(undefined);
        setMessages([]);
        setIsProcessing(false);
        setReferencedFiles([]);
        setDraft("");
        setRecoveredDrafts([]);
      }
      if (message.type === "workspaceContextChanged") {
        if (message.requestId && message.requestId !== workspaceRequestIdRef.current) {
          return;
        }
        if (message.conversationId !== undefined && message.conversationId !== conversationIdRef.current) {
          return;
        }
        setWorkspaceContext((previous) => {
          if (previous?.binding.revision && previous.binding.revision !== message.context.binding.revision) {
            setReferencedFiles((files) => files.filter((file) => file.scope === "external-snapshot"));
          }
          return message.context;
        });
      }
      if (message.type === "generationAccepted") {
        const submitted = pendingRequestsRef.current.get(message.clientRequestId);
        pendingRequestsRef.current.delete(message.clientRequestId);
        if (submitted && draftRef.current.trim() === submitted.text) {
          draftRef.current = "";
          setDraft("");
        }
        if (submitted && sameReferenceSet(referencedFilesRef.current, submitted.referenceIds)) {
          referencedFilesRef.current = [];
          setReferencedFiles([]);
        }
        if (submitted || message.conversationId === conversationIdRef.current) {
          conversationIdRef.current = message.conversationId;
          activeGenerationIdRef.current = message.generationId;
          setConversationId(message.conversationId);
          setActiveGenerationId(message.generationId);
          setIsProcessing(true);
        }
      }
      if (message.type === "messageQueued") {
        const submitted = pendingRequestsRef.current.get(message.clientRequestId);
        if (submitted && (!conversationIdRef.current || conversationIdRef.current === message.conversationId)) {
          conversationIdRef.current = message.conversationId;
          setConversationId(message.conversationId);
        }
      }
      if (message.type === "requestRejected") {
        if (message.requestId) {
          pendingRequestsRef.current.delete(message.requestId);
        }
        setRequestError(message.error);
      }
      if (message.type === "protocolError") {
        setRequestError(message.error);
      }
      if (
        (message.type === "streamDone" || message.type === "streamError") &&
        message.generationId === activeGenerationIdRef.current
      ) {
        activeGenerationIdRef.current = undefined;
        setActiveGenerationId(undefined);
      }
      if (message.type === "generationSnapshot") {
        const currentConversationId = conversationIdRef.current;
        const active = currentConversationId
          ? message.generations.find((generation) => generation.conversationId === currentConversationId)
          : undefined;
        if (active) {
          activeGenerationIdRef.current = active.generationId;
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
        const recovered = currentConversationId
          ? message.recoveredDrafts.find((entry) => entry.conversationId === currentConversationId)
          : undefined;
        if (recovered?.messages.length) {
          setRecoveredDrafts(recovered.messages);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [appendReferencedFiles]);

  return (
    <div className="chatView">
      {loadedConversation?.hasEarlierMessages && loadedConversation.historyCursor ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => getVsCodeApi()?.postMessage({
            type: "loadConversationPage",
            requestId: beginNavigationRequest(),
            id: loadedConversation.id,
            cursor: loadedConversation.historyCursor!,
          })}
        >
          {t("chat.loadEarlierMessages")}
        </button>
      ) : null}
      <MessagesSection
        conversationId={conversationId}
        activeGenerationId={activeGenerationId}
        messages={messages}
        onMessagesChange={setMessages}
        isProcessing={isProcessing}
        onApiKeyStatusChange={setApiKeyStatus}
        onConfigLoaded={handleConfigLoaded}
        onConfigUpdateResult={applyConfigUpdateResult}
        permissionUpdatePending={isPermissionUpdatePending}
        onModelChanged={handleModelChanged}
        onProcessingChange={setIsProcessing}
        onFocusInput={focusInput}
        onGenerationCancelled={handleGenerationCancelled}
        usageBreakdown={usageBreakdown}
      />
      {apiKeyStatus === "missing" ? <div className="statusMessage warning">{t("chat.apiKeyMissing")}</div> : null}
      {isPermissionUpdatePending ? <div className="statusMessage" role="status" aria-live="polite">{t("chat.applyingPermissions")}</div> : null}
      {configUpdateError ? <div className="statusMessage warning" role="alert">{configUpdateError}</div> : null}
      {requestError ? <div className="statusMessage warning" role="alert">{requestError}</div> : null}
      {historyEnabled === false ? <div className="statusMessage incognito" role="status">{t("chat.incognitoActive")}</div> : null}

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
                  if (item.referencedFiles?.length) {
                    setReferencedFiles((current) => mergeReferencedFiles(current, item.referencedFiles!));
                  }
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
          conversationId={conversationId}
        />
      </div>
    </div>
  );
}

function getSavedChatState(): PersistentChatViewState | undefined {
  const state = getVsCodeApi()?.getState<Record<string, unknown>>();
  if (!state || typeof state !== "object") {
    return undefined;
  }

  const isV4 = state.schemaVersion === 4 && state.mode === "persistent";
  const isV3 = state.schemaVersion === 3 && state.mode === "persistent";
  const isV2 = state.schemaVersion === 2;
  if (!isV4 && !isV3 && !isV2) {return undefined;}

  return {
    schemaVersion: 4,
    mode: "persistent",
    draft: typeof state.draft === "string" ? state.draft : "",
    referencedFiles: Array.isArray(state.referencedFiles)
      ? state.referencedFiles.filter(isReferencedFile).filter((file) => file.scope !== "external-snapshot")
      : [],
    conversationId: typeof state.conversationId === "string" && state.conversationId.trim() ? state.conversationId : undefined,
  };
}

function referenceIdentity(file: ReferencedFile): string {
  return file.referenceId ?? `${file.scope ?? "workspace"}:${file.path}`;
}

function sameReferenceSet(files: ReferencedFile[], expected: string[]): boolean {
  return files.length === expected.length && files.every((file, index) => referenceIdentity(file) === expected[index]);
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
