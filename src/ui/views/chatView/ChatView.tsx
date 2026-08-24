import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ChatView.css";
import "@vscode/codicons/dist/codicon.css";
import { InputCtrls, InputFooter, MessagesSection } from "./sections";
import { useChatConfig } from "./hooks";
import type { ApiKeyStatus, ChatMessage } from "./ChatViewTypes";
import { getVsCodeApi } from "@webview/VsCodeApi";
import type { Conversation, ImageAttachment, PermissionMode, QueuedGenerationMessage, ReferencedFile, WorkspaceContextStatus } from "@/contracts";
import type { GenerationSnapshot } from "@/contracts";
import { t } from "@webview/i18n";
import { beginNavigationRequest } from "@webview/NavigationRequests";
import { aggregateUsageAggregates, aggregateUsageByModel } from "@/shared/usage/Usage";

type ChatCommandMessage =
  | { type: "addReferencedFiles"; files: ReferencedFile[] }
  | { type: "clearChat" }
  | { type: "setDraft"; text: string }
  | { type: "generationAccepted"; generationId: string; conversationId: string; clientRequestId: string }
  | { type: "messageQueued"; conversationId: string; clientRequestId: string; position: number }
  | { type: "requestRejected"; requestId?: string; action?: string; error: string }
  | { type: "protocolError"; supportedVersion: number; error: string }
  | { type: "streamDone"; generationId?: string; conversationId?: string; status: "completed" | "cancelled" | "interrupted" }
  | { type: "streamError"; generationId?: string; conversationId?: string }
  | { type: "workspaceContextChanged"; requestId?: string; conversationId?: string; context: WorkspaceContextStatus }
  | { type: "contextFilesSelected"; files: ReferencedFile[] }
  | { type: "imageAttachmentsSelected"; requestId: string; attachments: ImageAttachment[]; error?: string }
  | { type: "imageAttachmentDeleted"; requestId: string; fileId: string; success: boolean; error?: string }
  | { type: "generationSnapshot"; generations: GenerationSnapshot[]; recoveredDrafts: Array<{ conversationId: string; messages: QueuedGenerationMessage[] }> };

interface PersistentChatViewState {
  schemaVersion: 5;
  mode: "persistent";
  draft: string;
  referencedFiles: ReferencedFile[];
  imageAttachments: ImageAttachment[];
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
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(loadedConversation?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | undefined>(loadedConversation?.id);
  const [stateHydrated, setStateHydrated] = useState(false);
  const [activeGenerationId, setActiveGenerationId] = useState<string | undefined>();
  const [recoveredDrafts, setRecoveredDrafts] = useState<QueuedGenerationMessage[]>([]);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextStatus>();
  const conversationIdRef = useRef(conversationId);
  const activeGenerationIdRef = useRef(activeGenerationId);
  const pendingRequestsRef = useRef(new Map<string, { text: string; referenceIds: string[]; imageIds: string[] }>());
  const draftRef = useRef(draft);
  const referencedFilesRef = useRef(referencedFiles);
  const imageAttachmentsRef = useRef(imageAttachments);
  const [requestError, setRequestError] = useState<string>();
  const initialConfigHandledRef = useRef(false);
  const workspaceRequestIdRef = useRef<string | undefined>(undefined);
  const workspaceMismatchRef = useRef<string | undefined>(undefined);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const usageSummary = useMemo(() => {
    const generationUsages = messages.flatMap((message) => message.usage ? [message.usage] : []);
    return {
      total: aggregateUsageAggregates(generationUsages),
      byModel: aggregateUsageByModel(generationUsages),
    };
  }, [messages]);

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

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

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
    pendingRequestsRef.current.set(clientRequestId, {
      text,
      referenceIds: referencedFilesRef.current.map(referenceIdentity),
      imageIds: imageAttachmentsRef.current.map((attachment) => attachment.id),
    });
    setRequestError(undefined);
  };

  const removeFile = useCallback((index: number) => {
    setReferencedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  const removeImageAttachment = useCallback((attachment: ImageAttachment) => {
    setImageAttachments((items) => items.filter((item) => item.id !== attachment.id));
    getVsCodeApi()?.postMessage({
      type: "deleteImageAttachment",
      requestId: crypto.randomUUID(),
      attachment,
    });
  }, []);

  const appendReferencedFiles = useCallback((files: ReferencedFile[]) => {
    setReferencedFiles((currentFiles) => mergeReferencedFiles(currentFiles, files));
    requestAnimationFrame(focusInput);
  }, []);

  const canSend = useMemo(() => {
    const trimmedDraft = draft.trim();
    const workspaceReady = workspaceContext?.state === "connected" || workspaceContext?.state === "empty";
    return !navigationPending && !isPermissionUpdatePending &&
      (trimmedDraft.length > 0 || imageAttachments.length > 0) &&
      (apiKeyStatus === "configured" || trimmedDraft.startsWith("/")) &&
      (workspaceReady || trimmedDraft.startsWith("/"));
  }, [draft, imageAttachments, apiKeyStatus, isPermissionUpdatePending, navigationPending, workspaceContext]);

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
          setImageAttachments(savedState.imageAttachments);
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
      schemaVersion: 5,
      mode: "persistent",
      draft,
      referencedFiles: referencedFiles.filter((file) => file.scope !== "external-snapshot"),
      imageAttachments,
      conversationId,
    });
  }, [draft, referencedFiles, imageAttachments, conversationId, historyEnabled, stateHydrated]);

  useEffect(() => {
    const vscode = getVsCodeApi();
    if (!vscode) {return;}

    const handleMessage = (event: MessageEvent<ChatCommandMessage>) => {
      const message = event.data;
      if (message.type === "addReferencedFiles" || message.type === "contextFilesSelected") {
        appendReferencedFiles(message.files);
      }
      if (message.type === "imageAttachmentsSelected") {
        if (message.error) {setRequestError(message.error);}
        if (message.attachments.length > 0) {
          setImageAttachments((current) => [...current, ...message.attachments].slice(0, 8));
          requestAnimationFrame(focusInput);
        }
      }
      if (message.type === "imageAttachmentDeleted" && !message.success && message.error) {
        setRequestError(message.error);
      }
      if (message.type === "setDraft") {
        setDraft(message.text);
        requestAnimationFrame(focusInput);
      }
      if (message.type === "clearChat") {
        conversationIdRef.current = undefined;
        activeGenerationIdRef.current = undefined;
        pendingRequestsRef.current.clear();
        setConversationId(undefined);
        setActiveGenerationId(undefined);
        setMessages([]);
        setIsProcessing(false);
        setReferencedFiles([]);
        setImageAttachments([]);
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
        if (submitted && sameImageSet(imageAttachmentsRef.current, submitted.imageIds)) {
          imageAttachmentsRef.current = [];
          setImageAttachments([]);
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
          imageAttachments={imageAttachments}
          onRemoveImageAttachment={removeImageAttachment}
          onImagePasteError={setRequestError}
          conversationId={conversationId}
          workspaceRevision={workspaceContext?.binding.revision}
          activeGenerationId={activeGenerationId}
          onSend={handleSend}
          footer={(
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
              usage={usageSummary.total}
              usageByModel={usageSummary.byModel}
              showUsage={usageBreakdown}
            />
          )}
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

  if (state.schemaVersion !== 5 || state.mode !== "persistent") {return undefined;}

  return {
    schemaVersion: 5,
    mode: "persistent",
    draft: typeof state.draft === "string" ? state.draft : "",
    referencedFiles: Array.isArray(state.referencedFiles)
      ? state.referencedFiles.filter(isReferencedFile).filter((file) => file.scope !== "external-snapshot")
      : [],
    imageAttachments: Array.isArray(state.imageAttachments)
      ? state.imageAttachments.filter(isImageAttachment)
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

function sameImageSet(images: ImageAttachment[], expected: string[]): boolean {
  return images.length === expected.length && images.every((image, index) => image.id === expected[index]);
}

function isImageAttachment(value: unknown): value is ImageAttachment {
  if (!value || typeof value !== "object") {return false;}
  const image = value as Partial<ImageAttachment>;
  return typeof image.id === "string" && typeof image.fileId === "string" &&
    typeof image.name === "string" && typeof image.previewUri === "string" &&
    typeof image.expiresAt === "number" && image.expiresAt > Date.now();
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
