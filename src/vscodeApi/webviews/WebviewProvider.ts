import * as vscode from "vscode";
import { ChatHandler } from "./handlers/ChatHandler";
import { SettingsHandler } from "./handlers/SettingsHandler";
import { HistoryHandler } from "./handlers/HistoryHandler";
import { getDevViewContent } from "./utils/DevViewRenderer";
import { getHtmlContent } from "./utils/HtmlRenderer";
import { HistoryManager } from "@/vscodeApi/storage";
import { getPathCompletionItems, insertCodeIntoActiveEditor, openWorkspaceFile } from "@/vscodeApi/editor/EditorActions";
import { CHAT_VIEW_TYPE, SIDEBAR_VIEW_ID } from "@/shared/constants";
import { logWarning } from "@/shared/logging/Logger";
import type { WebviewToHandlerMessage } from "@/adapters";
import type { ReferencedFilePayload } from "@/vscodeApi/commands/ChatCommands";
import { isWebviewToHandlerMessage } from "./WebviewMessageValidation";

type ChatCommandMessage = { type: "addReferencedFiles"; files: ReferencedFilePayload[] } | { type: "setDraft"; text: string };

export class WebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = CHAT_VIEW_TYPE;

  private readonly chatHandler: ChatHandler;
  private readonly settingsHandler: SettingsHandler;
  private readonly historyHandler: HistoryHandler;
  private readonly historyManager: HistoryManager;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingMessages: ChatCommandMessage[] = [];
  private webviewView?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {
    this.historyManager = new HistoryManager(this._context);
    this.chatHandler = new ChatHandler(this._context, this.historyManager);
    this.settingsHandler = new SettingsHandler(this._context);
    this.historyHandler = new HistoryHandler(
      this.historyManager,
      (conversation) => this.chatHandler.loadConversation(conversation),
      (id) => {
        if (this.chatHandler.forgetConversation(id)) {
          void this.webviewView?.webview.postMessage({ type: "clearChat" });
        }
      },
      (id) => this.chatHandler.prepareConversationDeletion(id),
    );

  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
    this.chatHandler.attachWebview(webviewView);
    const webviewDistUri = vscode.Uri.joinPath(this._extensionUri, "dist", "webview");
    const codiconsDistUri = vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode", "codicons", "dist");
    const devServerUrl = process.env.DEEPSEEK_COPILOT_WEBVIEW_DEV_SERVER;
    const codiconFontUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(codiconsDistUri, "codicon.ttf"));

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewDistUri, codiconsDistUri],
      portMapping: [
        {
          webviewPort: 5175,
          extensionHostPort: 5175,
        },
      ],
    };

    const useDevServer = devServerUrl ? await this.isDevServerAvailable(devServerUrl) : false;
    webviewView.webview.html =
      devServerUrl && useDevServer
        ? getDevViewContent({ webview: webviewView.webview, devServerUrl, codiconFontUri })
        : getHtmlContent(webviewView.webview, webviewDistUri, codiconsDistUri);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (isWebviewToHandlerMessage(message)) {
        this._routeMessage(message, webviewView);
      } else {
        logWarning("[WebviewProvider] Ignoring malformed webview message");
      }
    });

    await this.flushPendingMessages();
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.webviewView = undefined;
  }

  public async initialize(): Promise<void> {
    await this.historyManager.initialize();
    await this.chatHandler.initialize();
  }

  public async shutdown(): Promise<void> {
    await this.chatHandler.shutdown();
    this.dispose();
  }

  public async addReferencedFiles(files: ReferencedFilePayload[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    await this.postToChat({ type: "addReferencedFiles", files });
  }

  public async setDraft(text: string): Promise<void> {
    await this.postToChat({ type: "setDraft", text });
  }

  public async startNewChat(): Promise<void> {
    await this.revealChat();
    if (this.webviewView) {
      this.chatHandler.handle({ type: "newConversation" }, this.webviewView);
      await this.webviewView.webview.postMessage({ type: "setDraft", text: "" });
    }
  }

  private async postToChat(message: ChatCommandMessage): Promise<void> {
    await this.revealChat();

    if (!this.webviewView) {
      this.pendingMessages.push(message);
      return;
    }

    await this.webviewView.webview.postMessage(message);
  }

  private async revealChat(): Promise<void> {
    await vscode.commands.executeCommand(SIDEBAR_VIEW_ID);
  }

  private async flushPendingMessages(): Promise<void> {
    if (!this.webviewView || this.pendingMessages.length === 0) {
      return;
    }

    const messages = this.pendingMessages.splice(0);
    for (const message of messages) {
      await this.webviewView.webview.postMessage(message);
    }
  }

  private async isDevServerAvailable(devServerUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 750);
      try {
        const response = await fetch(devServerUrl, { signal: controller.signal });
        return response.ok;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      logWarning(`[WebviewProvider] Webview dev server unavailable at ${devServerUrl}; falling back to built webview.`);
      return false;
    }
  }

  private _routeMessage(message: WebviewToHandlerMessage, webviewView: vscode.WebviewView): void {
    switch (message.type) {
      case "sendMessage":
      case "steerGeneration":
      case "cancelGeneration":
      case "getGenerationSnapshot":
      case "consumeRecoveredDraft":
      case "getAvailableTools":
      case "executeToolCall":
      case "toolCallLimitDecision":
      case "newConversation":
        this.chatHandler.handle(message, webviewView);
        break;

      case "getPathCompletions":
        void this.handlePathCompletions(message.requestId, message.query, webviewView);
        break;

      case "copyCode":
        void vscode.env.clipboard.writeText(message.code);
        break;

      case "insertCode":
        void insertCodeIntoActiveEditor(message.code);
        break;

      case "selectModel":
        void webviewView.webview.postMessage({ type: "modelChanged", modelId: message.modelId });
        break;

      case "getConfig":
      case "saveConfig":
      case "resetConfig":
      case "testConnection":
        this.settingsHandler.handle(message, webviewView);
        break;

      case "getHistory":
      case "deleteConversation":
      case "deleteConversations":
      case "loadConversation":
        this.historyHandler.handle(message, webviewView);
        break;

      case "openFile":
        void openWorkspaceFile(message.path, message.line);
        break;

      default:
        logWarning("[WebviewProvider] Unknown message type");
    }
  }

  private async handlePathCompletions(requestId: number, query: string, webviewView: vscode.WebviewView): Promise<void> {
    const items = await getPathCompletionItems(query);
    await webviewView.webview.postMessage({ type: "pathCompletions", requestId, query, items });
  }
}
