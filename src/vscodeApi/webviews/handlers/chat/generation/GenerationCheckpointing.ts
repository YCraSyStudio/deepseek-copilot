import type * as vscode from "vscode";
import type { GenerationCoordinator } from "@/core/chat/GenerationCoordinator";
import type { GenerationCheckpointStore, HistoryManager } from "@/vscodeApi/storage";
import { SettingsManager } from "@/vscodeApi/storage";
import type { SendMessagePayload } from "../Types";
import type { GenerationRunRecord } from "./GenerationRun";

export interface GenerationCheckpointDependencies {
  checkpointStore: GenerationCheckpointStore;
  coordinator: GenerationCoordinator<SendMessagePayload>;
  historyManager: HistoryManager;
}

export function scheduleGenerationCheckpoint(
  record: GenerationRunRecord,
  checkpoint: (record: GenerationRunRecord, immediate: boolean) => Promise<void>,
): void {
  if (record.checkpointTimer) {
    return;
  }
  record.checkpointTimer = setTimeout(() => {
    record.checkpointTimer = undefined;
    void checkpoint(record, false);
  }, 500);
}

export async function checkpointGeneration(
  record: GenerationRunRecord,
  immediate: boolean,
  dependencies: GenerationCheckpointDependencies,
): Promise<void> {
  if (!SettingsManager.load().historyEnabled || record.state.isIncognito()) {
    if (record.checkpointTimer) {
      clearTimeout(record.checkpointTimer);
      record.checkpointTimer = undefined;
    }
    return;
  }
  if (immediate && record.checkpointTimer) {
    clearTimeout(record.checkpointTimer);
    record.checkpointTimer = undefined;
  }
  const config = SettingsManager.load();
  const { apiKey: _apiKey, ...safeConfig } = config;
  await dependencies.checkpointStore.save({
    conversationId: record.conversationId,
    generationId: record.generationId,
    status: record.status,
    userMessage: record.userMessage,
    content: record.content,
    timeline: structuredClone(record.timeline),
    toolCalls: structuredClone(record.toolCalls),
    queue: dependencies.coordinator.getQueue(record.conversationId).map((task) => ({
      clientRequestId: task.clientRequestId,
      text: task.payload.text,
      queuedAt: task.queuedAt,
    })),
    config: safeConfig,
    permissionSnapshot: record.permissionSnapshot,
    providerTranscript: record.providerTranscript ? structuredClone(record.providerTranscript) : undefined,
    workspaceUri: record.state.getConversation()?.workspaceUri ?? dependencies.historyManager.getWorkspaceUri(),
    workspaceBinding: record.state.getConversation()?.workspaceBinding,
    updatedAt: Date.now(),
  });
}

export async function checkpointQueuedGeneration(
  conversationId: string,
  runs: ReadonlyMap<string, GenerationRunRecord>,
  dependencies: GenerationCheckpointDependencies,
): Promise<void> {
  if (!SettingsManager.load().historyEnabled) {
    return;
  }
  const active = dependencies.coordinator.getActiveForConversation(conversationId);
  const record = active ? runs.get(active.generationId) : undefined;
  if (record) {
    await checkpointGeneration(record, true, dependencies);
    return;
  }
  const queue = dependencies.coordinator.getQueue(conversationId);
  if (queue.length === 0) {
    return;
  }
  const conversation = await dependencies.historyManager.getById(conversationId);
  await dependencies.checkpointStore.save({
    conversationId,
    status: "queued",
    content: "",
    timeline: [],
    toolCalls: [],
    queue: queue.map((task) => ({ clientRequestId: task.clientRequestId, text: task.payload.text, queuedAt: task.queuedAt })),
    workspaceUri: conversation?.workspaceUri ?? "workspace:unknown",
    workspaceBinding: conversation?.workspaceBinding,
    updatedAt: Date.now(),
  });
}

export function buildGenerationSnapshot(
  runs: ReadonlyMap<string, GenerationRunRecord>,
  recoveredDrafts: ReadonlyMap<string, Array<{ clientRequestId: string; text: string; queuedAt: number }>>,
  coordinator: GenerationCoordinator<SendMessagePayload>,
): Record<string, unknown> {
  return {
    type: "generationSnapshot",
    generations: [...runs.values()].map((record) => ({
      generationId: record.generationId,
      conversationId: record.conversationId,
      status: record.status,
      userMessage: record.userMessage ?? record.state.createMessage("user", ""),
      content: record.content,
      timeline: structuredClone(record.timeline),
      toolCalls: structuredClone(record.toolCalls),
      queue: coordinator.getQueue(record.conversationId).map((task) => ({
        clientRequestId: task.clientRequestId,
        text: task.payload.text,
        queuedAt: task.queuedAt,
      })),
    })),
    recoveredDrafts: [...recoveredDrafts].map(([conversationId, messages]) => ({ conversationId, messages })),
  };
}

export function replayGenerationEvents(
  record: GenerationRunRecord | undefined,
  webviewView: vscode.WebviewView | undefined,
  lastReplayedGeneration: WeakMap<object, string>,
): void {
  if (!record || !webviewView || lastReplayedGeneration.get(webviewView) === record.generationId) {
    return;
  }
  lastReplayedGeneration.set(webviewView, record.generationId);
  for (const event of record.eventLog) {
    const type = event.type;
    if (
      type === "toolCallStarted" ||
      type === "toolCallConfirmationRequired" ||
      type === "toolCallResult" ||
      type === "toolCallActionAccepted" ||
      type === "toolCallLimitReached"
    ) {
      void webviewView.webview.postMessage(event);
    }
  }
}
