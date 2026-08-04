import * as vscode from "vscode";
import type { WebviewToHandlerMessage } from "@/adapters";
import type { StoredConversation } from "@/core/chat/ProviderTranscript";
import { toPresentationConversation } from "@/core/chat/ProviderTranscript";
import { HistoryManager } from "@/vscodeApi/storage";
import { logWarning } from "@/shared/logging/Logger";

export class HistoryHandler {
  constructor(
    private readonly historyManager: HistoryManager,
    private readonly onConversationLoaded?: (conversation: StoredConversation) => void,
    private readonly onConversationDeleted?: (id: string) => void,
    private readonly onBeforeConversationDelete?: (id: string) => Promise<void>,
  ) {}

  handle(message: WebviewToHandlerMessage, webviewView: vscode.WebviewView): void {
    switch (message.type) {
      case "getHistory":
        void this.run(() => this.getHistory(webviewView), webviewView);
        break;
      case "deleteConversation":
        void this.run(() => this.deleteConversation(message.id, webviewView), webviewView);
        break;
      case "deleteConversations":
        void this.run(() => this.deleteConversations(message.ids, webviewView), webviewView);
        break;
      case "loadConversation":
        void this.run(() => this.loadConversation(message.id, webviewView), webviewView);
        break;
      default:
        logWarning(`[HistoryHandler] Unknown message: ${message.type}`);
    }
  }

  private async getHistory(webviewView: vscode.WebviewView): Promise<void> {
    const conversations = await this.historyManager.getSummaries();
    await webviewView.webview.postMessage({ type: "history", conversations });
  }

  private async deleteConversation(id: string, webviewView: vscode.WebviewView): Promise<void> {
    const deleted = await this.historyManager.getById(id);
    if (!deleted) {
      await this.getHistory(webviewView);
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      `Delete conversation "${deleted.title}"?`,
      { modal: true, detail: "You can undo the deletion immediately afterwards." },
      "Delete",
    );
    if (confirmation !== "Delete") {
      return;
    }
    await this.onBeforeConversationDelete?.(id);
    if (!await this.historyManager.delete(id, deleted.updatedAt)) {
      await webviewView.webview.postMessage({ type: "historyError", error: "The conversation changed in another window and was not deleted." });
      await this.getHistory(webviewView);
      return;
    }
    this.onConversationDeleted?.(id);
    await webviewView.webview.postMessage({ type: "conversationDeleted", id });
    await this.getHistory(webviewView);
    if ((await vscode.window.showInformationMessage("Conversation deleted.", "Undo")) === "Undo") {
      if (!await this.historyManager.saveIfAbsent(deleted)) {
        await webviewView.webview.postMessage({ type: "historyError", error: "Undo was skipped because a newer conversation with the same ID exists." });
      }
      await this.getHistory(webviewView);
    }
  }

  private async run(operation: () => Promise<void>, webviewView: vscode.WebviewView): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logWarning(`[HistoryHandler] ${message}`);
      await webviewView.webview.postMessage({ type: "historyError", error: message });
    }
  }

  private async deleteConversations(ids: string[], webviewView: vscode.WebviewView): Promise<void> {
    const deleted = (await Promise.all(ids.map((id) => this.historyManager.getById(id)))).filter(
      (item): item is StoredConversation => item !== undefined,
    );
    if (deleted.length === 0) {
      await this.getHistory(webviewView);
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      `Delete ${deleted.length} conversation(s)?`,
      { modal: true, detail: "You can undo the deletion immediately afterwards." },
      "Delete all",
    );
    if (confirmation !== "Delete all") {
      return;
    }
    await Promise.all(ids.map((id) => this.onBeforeConversationDelete?.(id)));
    const deletedIds = await this.historyManager.deleteMany(deleted.map((conversation) => ({ id: conversation.id, expectedUpdatedAt: conversation.updatedAt })));
    await Promise.all(deletedIds.map(async (id) => {
      this.onConversationDeleted?.(id);
      await webviewView.webview.postMessage({ type: "conversationDeleted", id });
    }));
    await this.getHistory(webviewView);
    if (deleted.length > 0 && (await vscode.window.showInformationMessage(`${deleted.length} conversation(s) deleted.`, "Undo")) === "Undo") {
      await Promise.all(deleted.filter((conversation) => deletedIds.includes(conversation.id)).map((conversation) => this.historyManager.saveIfAbsent(conversation)));
      await this.getHistory(webviewView);
    }
  }

  private async loadConversation(id: string, webviewView: vscode.WebviewView): Promise<void> {
    const conversation = await this.historyManager.getById(id);
    if (!conversation) {
      return;
    }

    this.onConversationLoaded?.(conversation);
    await webviewView.webview.postMessage({
      type: "conversationLoaded",
      conversation: toPresentationConversation(conversation),
    });
  }
}
