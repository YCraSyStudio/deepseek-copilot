import type * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { GenerationCheckpointStore, HistoryManager } from "@/platform/vscode/storage";
import { logWarning } from "@/shared/logging/Logger";
import type { QueuedGenerationMessage, ReferencedFile, WebviewToHandlerMessage, WorkspaceContextStatus } from "@/contracts";
import type { ToolRegistry } from "@/application/tools";
import {
  captureCurrentWorkspaceBinding,
  resolveWorkspaceContext,
} from "@/platform/vscode/workspace";
import { ConversationState } from "@/application/chat/ConversationState";
import { GenerationCoordinator } from "@/application/chat/GenerationCoordinator";
import { ResourceGovernor } from "@/application/chat/ResourceGovernor";
import type { StoredConversation } from "@/application/chat/ProviderTranscript";
import type { SendMessagePayload } from "./Types";
import { SlashCommandService } from "./SlashCommandService";
import {
  transitionGenerationRun,
  type GenerationEventCallbacks,
  type GenerationRunRecord,
} from "./generation/GenerationRun";
import { GenerationExecutor } from "./generation/GenerationExecutor";
import { recoverGenerationCheckpoints } from "./generation/GenerationRecovery";
import { ConversationWorkspaceReferences } from "./ConversationWorkspaceReferences";
import { ConversationWorkspaceCoordinator } from "./ConversationWorkspaceCoordinator";
import { MessageAdmissionService } from "./MessageAdmissionService";
import {
  cancelGeneration,
  postAvailableTools,
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
import type { HeadlessWebRuntime } from "@/infrastructure/browser/HeadlessWebRuntime";
import type { ModelProviderFactory, SecretStore, SettingsRepository } from "@/application/ports";

export class ChatHandler {
  private readonly conversationState: ConversationState;
  private readonly checkpointStore: GenerationCheckpointStore;
  private readonly coordinator: GenerationCoordinator<SendMessagePayload>;
  private readonly runs = new Map<string, GenerationRunRecord>();
  private readonly recoveredDrafts = new Map<string, QueuedGenerationMessage[]>();
  private selectedConversationId?: string;
  private webviewView?: vscode.WebviewView;
  private shuttingDown = false;
  private historyTransition?: {
    requestId: string;
    direction: "enter-incognito" | "exit-incognito";
    phase: "stop-work" | "exit-incognito";
  };
  private readonly lastReplayedGeneration = new WeakMap<object, string>();
  private readonly slashCommands: SlashCommandService;
  private readonly generationExecutor: GenerationExecutor;
  private readonly workspaceReferences: ConversationWorkspaceReferences;
  private readonly workspaceCoordinator: ConversationWorkspaceCoordinator;
  private readonly messageAdmission: MessageAdmissionService;
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
    private readonly toolRegistry: ToolRegistry,
    private readonly headlessWebRuntime: HeadlessWebRuntime,
    private readonly settings: SettingsRepository,
    private readonly secrets: SecretStore,
    private readonly modelProviderFactory: ModelProviderFactory,
  ) {
    this.checkpointStore = new GenerationCheckpointStore(this.settings);
    this.conversationState = new ConversationState(
      this.historyManager,
      this.settings.load().historyEnabled ? "persistent" : "incognito",
    );
    this.workspaceReferences = new ConversationWorkspaceReferences({
      conversationState: this.conversationState,
      historyManager: this.historyManager,
      post: (message) => this.post(message),
    });
    this.slashCommands = new SlashCommandService({
      context: this.context,
      conversationState: this.conversationState,
      toolRegistry: this.toolRegistry,
      getWorkspaceBinding: (conversationId) => this.workspaceReferences.getBinding(conversationId),
      getSelectedConversationId: () => this.selectedConversationId,
      settings: this.settings,
      secrets: this.secrets,
    });
    this.generationExecutor = new GenerationExecutor({
      historyManager: this.historyManager,
      activeConversationState: this.conversationState,
      toolRegistry: this.toolRegistry,
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
      settings: this.settings,
      secrets: this.secrets,
      modelProviderFactory: this.modelProviderFactory,
    });

    this.coordinator = new GenerationCoordinator({
      idGenerator: { next: randomUUID },
      getLimit: () => this.settings.load().maxConcurrentGenerations,
      resourceGovernor: new ResourceGovernor(),
      estimateTaskBytes: (task) => Buffer.byteLength(JSON.stringify(task.payload), "utf8"),
      run: (generationId, task, signal) =>
        this.generationExecutor.executeInWorkspace(generationId, task, signal),
      onStarted: (generationId, task) => {
        this.post({
          type: "generationAccepted",
          generationId,
          conversationId: task.conversationId,
          clientRequestId: task.clientRequestId,
        });
        this.postGenerationActivity(task.conversationId, generationId, "running");
        this.postHistoryTransitionActivity();
      },
      onQueued: (task, position) => {
        this.post({ type: "messageQueued", conversationId: task.conversationId, clientRequestId: task.clientRequestId, position });
        void this.checkpointQueuedConversation(task.conversationId);
        this.postGenerationActivity(task.conversationId, undefined, "queued");
      },
      onSettled: (generationId, task) => {
        void this.checkpointQueuedConversation(task.conversationId);
        this.postGenerationActivity(task.conversationId, generationId, "settled");
        this.postHistoryTransitionActivity();
      },
    });
    this.workspaceCoordinator = new ConversationWorkspaceCoordinator({
      checkpointStore: this.checkpointStore,
      conversationState: this.conversationState,
      coordinator: this.coordinator,
      historyManager: this.historyManager,
      post: (message) => this.post(message),
      postGenerationSnapshot: () => this.postGenerationSnapshot(),
      recoveredDrafts: this.recoveredDrafts,
      runs: this.runs,
      workspaceReferences: this.workspaceReferences,
    });
    this.messageAdmission = new MessageAdmissionService({
      conversationState: this.conversationState,
      coordinator: this.coordinator,
      getWebview: () => this.webviewView,
      hasHistoryTransition: () => this.historyTransition !== undefined,
      historyManager: this.historyManager,
      isShuttingDown: () => this.shuttingDown,
      loadConversation: (conversation) => this.loadConversation(conversation),
      onConversationCreated: (conversationId) => {
        this.selectedConversationId = conversationId;
      },
      post: (message) => this.post(message),
      resolveWorkspaceContext,
      settings: this.settings,
      slashCommands: this.slashCommands,
      workspaceReferences: this.workspaceReferences,
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
          imageAttachments: message.imageAttachments,
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
        {
          const accepted = cancelGeneration(
            message.generationId,
            message.conversationId,
            this.coordinator,
            this.runs,
          );
          this.post({
            type: "cancelGenerationResult",
            requestId: message.requestId,
            generationId: message.generationId,
            conversationId: message.conversationId,
            status: accepted ? "accepted" : "stale",
          });
          if (accepted) {
            this.postGenerationActivity(message.conversationId, message.generationId, "cancelling");
          }
        }
        break;
      case "executeToolCall":
        this.runs.get(message.generationId)?.session.handleUserAction({
          toolCallId: message.toolCallId,
          action: message.action,
        });
        break;
      case "getGenerationSnapshot":
        this.postGenerationSnapshot();
        this.postAllGenerationActivity();
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
        void this.checkpointQueuedConversation(message.conversationId);
        break;
      }
      case "getAvailableTools":
        postAvailableTools(webviewView, this.toolRegistry);
        break;
      case "newConversation":
        this.conversationState.reset();
        this.selectedConversationId = undefined;
        void webviewView.webview.postMessage({ type: "newConversationReady", requestId: message.requestId });
        this.workspaceReferences.postContext(captureCurrentWorkspaceBinding());
        break;
      case "getWorkspaceContext":
        void this.getWorkspaceContext(message.conversationId).then((context) => {
          this.post({
            type: "workspaceContextChanged",
            requestId: message.requestId,
            conversationId: message.conversationId,
            context,
          });
        });
        break;
      case "rebindConversationWorkspace":
        void this.workspaceCoordinator.confirmAndRebind(message.conversationId, message.workspaceRevision);
        break;
      case "openConversationWorkspace":
        void this.workspaceCoordinator.open(message.conversationId);
        break;
      default:
        logWarning(`[ChatHandler] Unknown message: ${message.type}`);
    }
  }

  loadConversation(conversation: StoredConversation): void {
    if (!this.settings.load().historyEnabled) {
      return;
    }
    this.conversationState.load(conversation);
    this.selectedConversationId = conversation.id;
    this.workspaceReferences.postContext(conversation.workspaceBinding);
  }

  async getWorkspaceContext(conversationId?: string): Promise<WorkspaceContextStatus> {
    return this.workspaceCoordinator.getContext(conversationId ?? this.selectedConversationId);
  }

  registerExternalContextFiles(files: ReferencedFile[]): void {
    this.workspaceReferences.registerExternalContextFiles(files);
  }

  async rebindConversationWorkspace(conversationId: string): Promise<WorkspaceContextStatus> {
    return this.workspaceCoordinator.rebind(conversationId);
  }

  async handleWorkspaceFoldersChanged(): Promise<void> {
    await this.workspaceCoordinator.handleFoldersChanged(this.selectedConversationId);
  }

  forgetConversation(id: string): boolean {
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId, "deleted");
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
      this.settings,
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
        transitionGenerationRun(record, "interrupted");
        record.session.cancel();
      }
      this.coordinator.interrupt(generation.generationId, "history_transition");
    }
    await Promise.allSettled(active.map((generation) => generation.completion));
    this.recoveredDrafts.clear();
  }

  async enterIncognito(requestId: string): Promise<void> {
    await this.stopPendingWork();
    await this.checkpointStore.clearAll().catch(() => undefined);
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
    this.workspaceReferences.clear();
    this.post({ type: "clearChat" });
    this.workspaceReferences.postContext(captureCurrentWorkspaceBinding());
    this.postGenerationSnapshot();
    this.cancelHistoryTransition(requestId);
  }

  async discardIncognitoForWebviewRecreation(): Promise<void> {
    if (!this.settings.load().historyEnabled) {
      await this.stopPendingWork();
      await this.checkpointStore.clearAll().catch(() => undefined);
      this.conversationState.reset("incognito");
      this.selectedConversationId = undefined;
      this.recoveredDrafts.clear();
      this.workspaceReferences.clear();
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    for (const record of this.runs.values()) {
      transitionGenerationRun(record, "interrupted");
      record.session.cancel();
    }
    await this.coordinator.shutdown();
    await this.headlessWebRuntime.dispose();
    await Promise.allSettled([...this.runs.values()].map((record) => this.checkpointRun(record, true)));
    await this.checkpointStore.flush();
  }

  async prepareConversationDeletion(id: string): Promise<void> {
    this.coordinator.clearQueue(id);
    const active = this.coordinator.getActiveForConversation(id);
    if (active) {
      this.runs.get(active.generationId)?.session.cancel();
      this.coordinator.interrupt(active.generationId, "deleted");
      await active.completion;
    }
    await this.checkpointStore.delete(id);
  }

  private async acceptMessage(payload: SendMessagePayload, front = false): Promise<void> {
    await this.messageAdmission.accept(payload, front);
  }

  private scheduleCheckpoint(record: GenerationRunRecord): void {
    if (!this.settings.load().historyEnabled || record.state.isIncognito()) {
      return;
    }
    scheduleGenerationCheckpoint(record, (target, immediate) => this.checkpointRun(target, immediate));
  }

  private async checkpointRun(record: GenerationRunRecord, immediate: boolean): Promise<void> {
    await checkpointGeneration(record, immediate, {
      checkpointStore: this.checkpointStore,
      coordinator: this.coordinator,
      historyManager: this.historyManager,
      settings: this.settings,
    });
  }

  private async checkpointQueuedConversation(conversationId: string): Promise<void> {
    if (this.conversationState.isIncognito()) {
      return;
    }
    await checkpointQueuedGeneration(conversationId, this.runs, this.recoveredDrafts, {
      checkpointStore: this.checkpointStore,
      coordinator: this.coordinator,
      historyManager: this.historyManager,
      settings: this.settings,
    });
  }

  private postGenerationSnapshot(): void {
    this.post(buildGenerationSnapshot(this.runs, this.recoveredDrafts, this.coordinator));
  }

  private postGenerationActivity(
    conversationId: string,
    generationId: string | undefined,
    status: "queued" | "running" | "cancelling" | "settled",
  ): void {
    this.post({
      type: "generationActivityChanged",
      conversationId,
      generationId,
      status,
      queuedMessages: this.coordinator.getQueue(conversationId).length,
    });
  }

  private postAllGenerationActivity(): void {
    const activeConversations = new Set<string>();
    for (const active of this.coordinator.getActiveGenerations()) {
      activeConversations.add(active.task.conversationId);
      const record = this.runs.get(active.generationId);
      this.postGenerationActivity(
        active.task.conversationId,
        active.generationId,
        record?.status === "cancelling" ? "cancelling" : "running",
      );
    }
    for (const conversationId of this.coordinator.getQueuedConversationIds()) {
      if (!activeConversations.has(conversationId)) {
        this.postGenerationActivity(conversationId, undefined, "queued");
      }
    }
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
