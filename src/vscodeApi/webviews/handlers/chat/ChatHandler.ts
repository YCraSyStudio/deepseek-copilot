import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { GenerationCheckpointStore, HistoryManager, SettingsManager } from "@/vscodeApi/storage";
import { logWarning } from "@/shared/logging/Logger";
import type { ConversationMessage, ReferencedFile, WebviewToHandlerMessage, WorkspaceContextStatus } from "@/adapters";
import { BUILT_IN_TOOLS, ToolRegistry } from "@/core/tools";
import {
  captureCurrentWorkspaceBinding,
  createLegacyWorkspaceBinding,
  resolveWorkspaceContext,
} from "@/vscodeApi/workspace";
import { ConversationState } from "@/core/chat/ConversationState";
import { GenerationCoordinator } from "@/core/chat/GenerationCoordinator";
import type { StoredConversation } from "@/core/chat/ProviderTranscript";
import { DangerTrustStore } from "./toolCalls/DangerTrustStore";
import type { SendMessagePayload } from "./Types";
import { SlashCommandService } from "./SlashCommandService";
import {
  type GenerationEventCallbacks,
  type GenerationRunRecord,
} from "./generation/GenerationRun";
import { GenerationExecutor } from "./generation/GenerationExecutor";
import { recoverGenerationCheckpoints } from "./generation/GenerationRecovery";
import { ConversationWorkspaceReferences } from "./ConversationWorkspaceReferences";
import {
  cancelGeneration,
  postAvailableTools,
  restoreRequestedConversation,
  steerGeneration,
  syncSelectedConversation,
} from "./ConversationControl";
import {
  buildGenerationSnapshot,
  checkpointGeneration,
  checkpointQueuedGeneration,
  replayGenerationEvents,
  scheduleGenerationCheckpoint,
} from "./generation/GenerationCheckpointing";
import {
  getErrorMessage,
  getWorkspaceStatusError,
} from "./ChatHandlerSupport";

export class ChatHandler {
  private readonly conversationState: ConversationState;
  private readonly toolRegistry: ToolRegistry;
  private readonly checkpointStore = new GenerationCheckpointStore();
  private readonly coordinator: GenerationCoordinator<SendMessagePayload>;
  private readonly runs = new Map<string, GenerationRunRecord>();
  private readonly recoveredDrafts = new Map<string, Array<{ clientRequestId: string; text: string; queuedAt: number }>>();
  private selectedConversationId?: string;
  private webviewView?: vscode.WebviewView;
  private shuttingDown = false;
  private historyTransition?: {
    requestId: string;
    direction: "enter-incognito" | "exit-incognito";
    phase: "stop-work" | "exit-incognito";
  };
  private readonly lastReplayedGeneration = new WeakMap<object, string>();
  private readonly dangerTrustStore = new DangerTrustStore();
  private readonly slashCommands: SlashCommandService;
  private readonly generationExecutor: GenerationExecutor;
  private readonly workspaceReferences: ConversationWorkspaceReferences;
  private readonly generationEventCallbacks: GenerationEventCallbacks = {
    scheduleCheckpoint: (record) => this.scheduleCheckpoint(record),
    checkpointImmediately: (record) => {
      void this.checkpointRun(record, true);
    },
    postIfSelected: (record, message) => {
      if (this.selectedConversationId === record.conversationId) {
        void this.webviewView?.webview.postMessage(message);
      }
    },
  };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly historyManager: HistoryManager,
  ) {
    this.conversationState = new ConversationState(
      this.historyManager,
      SettingsManager.load().historyEnabled ? "persistent" : "incognito",
    );
    this.toolRegistry = new ToolRegistry();
    for (const tool of BUILT_IN_TOOLS) {
      this.toolRegistry.register(tool);
    }
    this.workspaceReferences = new ConversationWorkspaceReferences({
      conversationState: this.conversationState,
      historyManager: this.historyManager,
      post: (message) => this.post(message),
    });
    this.slashCommands = new SlashCommandService({
      context: this.context,
      conversationState: this.conversationState,
      toolRegistry: this.toolRegistry,
      dangerTrustStore: this.dangerTrustStore,
      getWorkspaceBinding: (conversationId) => this.workspaceReferences.getBinding(conversationId),
      getSelectedConversationId: () => this.selectedConversationId,
    });
    this.generationExecutor = new GenerationExecutor({
      context: this.context,
      historyManager: this.historyManager,
      activeConversationState: this.conversationState,
      toolRegistry: this.toolRegistry,
      dangerTrustStore: this.dangerTrustStore,
      checkpointStore: this.checkpointStore,
      runs: this.runs,
      generationEventCallbacks: this.generationEventCallbacks,
      checkpoint: (record, immediate) => this.checkpointRun(record, immediate),
      scheduleCheckpoint: (record) => this.scheduleCheckpoint(record),
      syncSelectedConversation: (state) =>
        syncSelectedConversation(
          state,
          this.selectedConversationId,
          this.conversationState,
        ),
      post: (message) => this.post(message),
    });

    this.coordinator = new GenerationCoordinator({
      getLimit: () => SettingsManager.load().maxConcurrentGenerations,
      run: (generationId, task, signal) =>
        this.generationExecutor.executeInWorkspace(generationId, task, signal),
      onStarted: (generationId, task) => {
        this.post({
          type: "generationAccepted",
          generationId,
          conversationId: task.conversationId,
          clientRequestId: task.clientRequestId,
        });
        this.postHistoryTransitionActivity();
      },
      onQueued: (task, position) => {
        this.post({ type: "messageQueued", conversationId: task.conversationId, clientRequestId: task.clientRequestId, position });
        void this.checkpointQueuedConversation(task.conversationId);
      },
      onSettled: (_generationId, task) => {
        void this.checkpointQueuedConversation(task.conversationId);
        this.postHistoryTransitionActivity();
      },
    });
  }

  handle(message: WebviewToHandlerMessage, webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    switch (message.type) {
      case "sendMessage":
        void this.acceptMessage({
          text: message.text,
          modelId: message.modelId,
          reasoning: message.reasoning,
          conversationId: message.conversationId,
          workspaceRevision: message.workspaceRevision,
          referencedFiles: message.referencedFiles,
          clientRequestId: message.clientRequestId,
        });
        break;
      case "steerGeneration":
        steerGeneration(
          message,
          this.coordinator,
          this.runs,
          (payload) => this.acceptMessage(payload, true),
        );
        break;
      case "cancelGeneration":
        cancelGeneration(message.generationId, this.coordinator, this.runs);
        break;
      case "executeToolCall":
        this.runs.get(message.generationId)?.session.handleUserAction({
          toolCallId: message.toolCallId,
          action: message.action,
          trustForSession: message.trustForSession,
        });
        break;
      case "toolCallLimitDecision":
        this.runs.get(message.generationId)?.session.handleLimitDecision(message.action);
        break;
      case "getGenerationSnapshot":
        this.postGenerationSnapshot();
        this.replaySelectedGeneration();
        break;
      case "consumeRecoveredDraft": {
        const drafts = this.recoveredDrafts.get(message.conversationId) ?? [];
        const remaining = drafts.filter((draft) => draft.clientRequestId !== message.clientRequestId);
        if (remaining.length > 0) {
          this.recoveredDrafts.set(message.conversationId, remaining);
        } else {
          this.recoveredDrafts.delete(message.conversationId);
        }
        break;
      }
      case "getAvailableTools":
        postAvailableTools(webviewView, this.toolRegistry);
        break;
      case "newConversation":
        this.dangerTrustStore.clear();
        this.conversationState.reset();
        this.selectedConversationId = undefined;
        webviewView.webview.postMessage({ type: "clearChat" });
        this.workspaceReferences.postContext(captureCurrentWorkspaceBinding());
        break;
      case "getWorkspaceContext":
        void this.getWorkspaceContext(message.conversationId).then((context) => {
          this.post({ type: "workspaceContextChanged", context });
        });
        break;
      case "rebindConversationWorkspace":
        void this.confirmAndRebindWorkspace(message.conversationId, message.workspaceRevision);
        break;
      case "openConversationWorkspace":
        void this.openConversationWorkspace(message.conversationId);
        break;
      default:
        logWarning(`[ChatHandler] Unknown message: ${message.type}`);
    }
  }

  loadConversation(conversation: StoredConversation): void {
    if (!SettingsManager.load().historyEnabled) {
      return;
    }
    this.dangerTrustStore.clear();
    this.conversationState.load(conversation);
    this.selectedConversationId = conversation.id;
    this.workspaceReferences.postContext(
      conversation.workspaceBinding ?? createLegacyWorkspaceBinding(conversation.workspaceUri),
    );
  }

  async getWorkspaceContext(conversationId?: string): Promise<WorkspaceContextStatus> {
    const binding = await this.workspaceReferences.getBinding(
      conversationId ?? this.selectedConversationId,
    );
    return resolveWorkspaceContext(binding);
  }

  registerExternalContextFiles(files: ReferencedFile[]): void {
    this.workspaceReferences.registerExternalContextFiles(files);
  }

  async rebindConversationWorkspace(conversationId: string): Promise<WorkspaceContextStatus> {
    const current = captureCurrentWorkspaceBinding();
    if (current.folders.length === 0) {
      throw new Error("Open at least one workspace folder before reassigning this conversation.");
    }
    const conversation = await this.historyManager.getById(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }
    const previous = conversation.workspaceBinding ?? createLegacyWorkspaceBinding(conversation.workspaceUri);
    const queued = this.coordinator.clearQueue(conversationId);
    if (queued.length > 0) {
      this.recoveredDrafts.set(conversationId, queued.map((task) => ({
        clientRequestId: task.clientRequestId,
        text: task.payload.text,
        queuedAt: task.queuedAt,
      })));
    }
    const active = this.coordinator.getActiveForConversation(conversationId);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId);
      await active.completion;
    }
    const rebound: StoredConversation = {
      ...conversation,
      workspaceUri: current.uri,
      workspaceBinding: current,
      workspaceRebindings: [
        ...(conversation.workspaceRebindings ?? []),
        { fromWorkspaceUri: previous.uri, toWorkspaceUri: current.uri, at: Date.now() },
      ].slice(-100),
      updatedAt: Date.now(),
    };
    await this.checkpointStore.delete(conversationId);
    await this.historyManager.save(rebound);
    if (this.selectedConversationId === conversationId) {
      this.conversationState.load(rebound);
    }
    const status = resolveWorkspaceContext(current);
    this.workspaceReferences.postContext(current);
    return status;
  }

  private async confirmAndRebindWorkspace(conversationId: string, expectedRevision?: string): Promise<void> {
    const currentContext = await this.getWorkspaceContext(conversationId);
    if (expectedRevision && expectedRevision !== currentContext.binding.revision) {
      this.post({ type: "workspaceRebindResult", success: false, error: "The stored workspace binding changed. Refresh and try again." });
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      "Reassign this conversation to the current workspace? Pending generations, queued messages and file references will be cleared.",
      { modal: true },
      "Reassign",
    );
    if (answer !== "Reassign") {
      this.post({ type: "workspaceRebindResult", success: false, error: "Workspace reassignment cancelled." });
      return;
    }
    try {
      const context = await this.rebindConversationWorkspace(conversationId);
      this.post({ type: "workspaceRebindResult", success: true, context });
      this.postGenerationSnapshot();
    } catch (error: unknown) {
      this.post({ type: "workspaceRebindResult", success: false, error: getErrorMessage(error) });
    }
  }

  private async openConversationWorkspace(conversationId: string): Promise<void> {
    const binding = await this.workspaceReferences.getBinding(conversationId);
    if (binding.uri.startsWith("yrs-workspace:")) {
      await vscode.window.showInformationMessage(`Open the workspace "${binding.name}" manually; it was not saved as a .code-workspace file.`);
      return;
    }
    const uri = vscode.Uri.parse(binding.uri);
    await vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
  }

  async handleWorkspaceFoldersChanged(): Promise<void> {
    const affected = new Set<string>();
    const conversationIds = new Set([
      ...this.coordinator.getActiveGenerations().map((active) => active.task.conversationId),
      ...this.coordinator.getQueuedConversationIds(),
    ]);
    for (const conversationId of conversationIds) {
      const selected = this.conversationState.getConversation();
      const conversation = await this.historyManager.getById(conversationId) ??
        (selected?.id === conversationId ? selected : undefined);
      const binding = conversation?.workspaceBinding ?? (conversation ? createLegacyWorkspaceBinding(conversation.workspaceUri) : undefined);
      if (binding && resolveWorkspaceContext(binding).state !== "connected") {
        affected.add(conversationId);
        const active = this.coordinator.getActiveForConversation(conversationId);
        if (active) {
          this.runs.get(active.generationId)?.session.cancel();
          this.coordinator.interrupt(active.generationId);
        }
      }
    }
    for (const conversationId of affected) {
      const queued = this.coordinator.clearQueue(conversationId);
      if (queued.length > 0) {
        this.recoveredDrafts.set(conversationId, queued.map((task) => ({
          clientRequestId: task.clientRequestId,
          text: task.payload.text,
          queuedAt: task.queuedAt,
        })));
      }
    }
    this.workspaceReferences.postContext(
      await this.workspaceReferences.getBinding(this.selectedConversationId),
    );
    this.postGenerationSnapshot();
  }

  forgetConversation(id: string): boolean {
    this.dangerTrustStore.clear();
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId);
    }
    const forgotten = this.conversationState.forget(id);
    if (forgotten) {
      this.selectedConversationId = undefined;
    }
    return forgotten;
  }

  attachWebview(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
  }

  detachWebview(webviewView: vscode.WebviewView): void {
    if (this.webviewView === webviewView) {
      this.webviewView = undefined;
    }
  }

  async initialize(): Promise<void> {
    await recoverGenerationCheckpoints(
      this.checkpointStore,
      this.historyManager,
      this.recoveredDrafts,
    );
  }

  beginHistoryTransition(
    requestId: string,
    direction: "enter-incognito" | "exit-incognito",
  ): { activeGenerations: number; queuedMessages: number } | undefined {
    if (this.historyTransition && this.historyTransition.requestId !== requestId) {
      return undefined;
    }
    this.historyTransition = {
      requestId,
      direction,
      phase: "stop-work",
    };
    return this.getPendingWorkCounts();
  }

  setHistoryTransitionPhase(phase: "stop-work" | "exit-incognito"): void {
    if (this.historyTransition) {
      this.historyTransition.phase = phase;
    }
  }

  cancelHistoryTransition(requestId: string): void {
    if (this.historyTransition?.requestId === requestId) {
      this.historyTransition = undefined;
    }
  }

  getPendingWorkCounts(): { activeGenerations: number; queuedMessages: number } {
    return {
      activeGenerations: this.coordinator.getActiveGenerations().length,
      queuedMessages: this.coordinator.getQueuedConversationIds()
        .reduce((total, id) => total + this.coordinator.getQueue(id).length, 0),
    };
  }

  hasIncognitoMessages(): boolean {
    return this.conversationState.isIncognito() && this.conversationState.hasMessages();
  }

  async stopPendingWork(): Promise<void> {
    for (const conversationId of this.coordinator.getQueuedConversationIds()) {
      this.coordinator.clearQueue(conversationId);
    }
    const active = [...this.coordinator.getActiveGenerations()];
    for (const generation of active) {
      const record = this.runs.get(generation.generationId);
      if (record) {
        record.status = "interrupted";
        record.session.cancel();
      }
      this.coordinator.interrupt(generation.generationId);
    }
    await Promise.allSettled(active.map((generation) => generation.completion));
    this.recoveredDrafts.clear();
  }

  async enterIncognito(requestId: string): Promise<void> {
    await this.stopPendingWork();
    await this.checkpointStore.clearAll().catch(() => undefined);
    this.dangerTrustStore.clear();
    this.workspaceReferences.clear();
    this.conversationState.reset("incognito");
    this.selectedConversationId = undefined;
    this.post({ type: "clearChat" });
    this.workspaceReferences.postContext(captureCurrentWorkspaceBinding());
    this.postGenerationSnapshot();
    this.cancelHistoryTransition(requestId);
  }

  async promoteIncognito(requestId: string): Promise<void> {
    await this.conversationState.promoteIncognito();
    this.cancelHistoryTransition(requestId);
  }

  discardIncognito(requestId: string): void {
    this.conversationState.reset("persistent");
    this.selectedConversationId = undefined;
    this.dangerTrustStore.clear();
    this.workspaceReferences.clear();
    this.post({ type: "clearChat" });
    this.workspaceReferences.postContext(captureCurrentWorkspaceBinding());
    this.postGenerationSnapshot();
    this.cancelHistoryTransition(requestId);
  }

  async discardIncognitoForWebviewRecreation(): Promise<void> {
    if (!SettingsManager.load().historyEnabled) {
      await this.stopPendingWork();
      await this.checkpointStore.clearAll().catch(() => undefined);
      this.conversationState.reset("incognito");
      this.selectedConversationId = undefined;
      this.recoveredDrafts.clear();
      this.dangerTrustStore.clear();
      this.workspaceReferences.clear();
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    for (const record of this.runs.values()) {
      record.status = "interrupted";
      record.session.cancel();
    }
    await this.coordinator.shutdown();
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    await this.checkpointStore.flush();
  }

  async prepareConversationDeletion(id: string): Promise<void> {
    this.coordinator.clearQueue(id);
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId);
      await active.completion;
    }
    await this.checkpointStore.delete(id);
  }

  private async acceptMessage(payload: SendMessagePayload, front = false): Promise<void> {
    if (this.shuttingDown) {
      this.post({ type: "streamError", error: "The extension is shutting down." });
      return;
    }
    if (this.historyTransition) {
      this.post({ type: "streamError", error: "Finish the incognito-mode decision before sending another message." });
      return;
    }
    await SettingsManager.waitForPendingWrites();
    const config = SettingsManager.load();
    const webviewView = this.webviewView;
    if (!webviewView) {
      return;
    }
    if (await this.slashCommands.handle(payload, config, webviewView)) {
      return;
    }

    if (!this.conversationState.isIncognito()) {
      await restoreRequestedConversation(
        payload.conversationId,
        this.conversationState,
        this.historyManager,
        (conversation) => this.loadConversation(conversation),
      );
    }
    let conversationId = !this.conversationState.isIncognito()
      ? payload.conversationId ?? this.conversationState.getActiveConversationId()
      : this.conversationState.getActiveConversationId();
    if (!conversationId) {
      conversationId = randomUUID();
      const now = Date.now();
      const workspaceBinding = this.historyManager.getWorkspaceBinding();
      this.conversationState.load({
        schemaVersion: 2,
        id: conversationId,
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        messages: [],
        model: payload.modelId || config.model,
        workspaceUri: workspaceBinding.uri,
        workspaceBinding,
      });
      this.selectedConversationId = conversationId;
      this.post({ type: "activeConversationChanged", id: conversationId });
      this.workspaceReferences.postContext(workspaceBinding);
    }
    const binding = await this.workspaceReferences.getBinding(conversationId);
    const workspaceStatus = resolveWorkspaceContext(binding);
    if (workspaceStatus.state === "disconnected" || workspaceStatus.state === "changed") {
      this.post({ type: "streamError", conversationId, error: getWorkspaceStatusError(workspaceStatus) });
      this.workspaceReferences.postContext(binding);
      return;
    }
    if (payload.workspaceRevision && payload.workspaceRevision !== binding.revision) {
      this.post({ type: "streamError", conversationId, error: "The workspace changed. Refresh the workspace context and try again." });
      this.workspaceReferences.postContext(binding);
      return;
    }
    let referencedFiles: ReferencedFile[] | undefined;
    try {
      referencedFiles = await this.workspaceReferences.validateFiles(
        payload.referencedFiles,
        binding,
      );
    } catch (error: unknown) {
      this.post({ type: "streamError", conversationId, error: getErrorMessage(error) });
      return;
    }
    this.coordinator.enqueue({
      conversationId,
      clientRequestId: payload.clientRequestId,
      queuedAt: Date.now(),
      payload: { ...payload, conversationId, referencedFiles },
    }, front);
  }

  private scheduleCheckpoint(record: GenerationRunRecord): void {
    if (!SettingsManager.load().historyEnabled || record.state.isIncognito()) {
      return;
    }
    scheduleGenerationCheckpoint(record, (target, immediate) => this.checkpointRun(target, immediate));
  }

  private async checkpointRun(record: GenerationRunRecord, immediate: boolean): Promise<void> {
    await checkpointGeneration(record, immediate, {
      checkpointStore: this.checkpointStore,
      coordinator: this.coordinator,
      historyManager: this.historyManager,
    });
  }

  private async checkpointQueuedConversation(conversationId: string): Promise<void> {
    if (this.conversationState.isIncognito()) {
      return;
    }
    await checkpointQueuedGeneration(conversationId, this.runs, {
      checkpointStore: this.checkpointStore,
      coordinator: this.coordinator,
      historyManager: this.historyManager,
    });
  }

  private postGenerationSnapshot(): void {
    this.post(buildGenerationSnapshot(this.runs, this.recoveredDrafts, this.coordinator));
  }

  private postHistoryTransitionActivity(): void {
    const transition = this.historyTransition;
    if (!transition || transition.phase !== "stop-work") {
      return;
    }
    this.post({
      type: "historyTransitionRequired",
      requestId: transition.requestId,
      phase: transition.phase,
      direction: transition.direction,
      ...this.getPendingWorkCounts(),
    });
  }

  private replaySelectedGeneration(): void {
    const active = this.selectedConversationId ? this.coordinator.getActiveForConversation(this.selectedConversationId) : undefined;
    const record = active ? this.runs.get(active.generationId) : undefined;
    replayGenerationEvents(record, this.webviewView, this.lastReplayedGeneration);
  }

  private post(message: Record<string, unknown>): void {
    void this.webviewView?.webview.postMessage(message);
  }
}

export default ChatHandler;
