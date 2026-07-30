import type * as vscode from "vscode";
import type { ConversationState } from "@/core/chat/ConversationState";
import type { GenerationCoordinator } from "@/core/chat/GenerationCoordinator";
import type { ToolRegistry } from "@/core/tools";
import type { HistoryManager } from "@/vscodeApi/storage";
import type { WebviewToHandlerMessage } from "@/adapters";
import type { SendMessagePayload } from "./Types";
import type { GenerationRunRecord } from "./generation/GenerationRun";
import { getAvailableToolMetadata } from "./ToolMetadata";

export async function restoreRequestedConversation(
  conversationId: string | undefined,
  state: ConversationState,
  historyManager: HistoryManager,
  loadConversation: (conversation: NonNullable<ReturnType<ConversationState["getConversation"]>>) => void,
): Promise<void> {
  if (!conversationId || state.getActiveConversationId() === conversationId) {
    return;
  }
  const conversation = await historyManager.getById(conversationId);
  if (conversation) {
    loadConversation(conversation);
  } else {
    state.reset();
  }
}

export function cancelGeneration(
  generationId: string,
  coordinator: GenerationCoordinator<SendMessagePayload>,
  runs: Map<string, GenerationRunRecord>,
): void {
  if (!coordinator.getActive(generationId)) {
    return;
  }
  const record = runs.get(generationId);
  if (record) {
    record.status = "interrupted";
    record.session.cancel();
  }
  coordinator.interrupt(generationId);
}

export function steerGeneration(
  message: Extract<WebviewToHandlerMessage, { type: "steerGeneration" }>,
  coordinator: GenerationCoordinator<SendMessagePayload>,
  runs: Map<string, GenerationRunRecord>,
  enqueueAtFront: (payload: SendMessagePayload) => Promise<void>,
): void {
  const active = coordinator.getActive(message.generationId);
  if (!active || active.task.conversationId !== message.conversationId) {
    return;
  }
  void enqueueAtFront({
    clientRequestId: message.clientRequestId,
    text: message.text,
    modelId: message.modelId,
    reasoning: message.reasoning,
    conversationId: message.conversationId,
    workspaceRevision: message.workspaceRevision,
    referencedFiles: message.referencedFiles,
  }).then(() => cancelGeneration(message.generationId, coordinator, runs));
}

export function postAvailableTools(
  webviewView: vscode.WebviewView,
  toolRegistry: ToolRegistry,
): void {
  void webviewView.webview.postMessage({
    type: "availableTools",
    tools: getAvailableToolMetadata(toolRegistry.getDefinitionsForAPI()),
  });
}

export function syncSelectedConversation(
  state: ConversationState,
  selectedConversationId: string | undefined,
  selectedState: ConversationState,
): void {
  if (state.getActiveConversationId() !== selectedConversationId) {
    return;
  }
  const conversation = state.getConversation();
  if (conversation) {
    selectedState.load(conversation);
  }
}
