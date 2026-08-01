import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { ChatHandler } from "./handlers/chat/ChatHandler";
import { SettingsHandler } from "./handlers/SettingsHandler";
import { HistoryHandler } from "./handlers/HistoryHandler";
import { getDevViewContent } from "./utils/DevViewRenderer";
import { getHtmlContent } from "./utils/HtmlRenderer";
import { HistoryManager, SettingsManager } from "@/vscodeApi/storage";
import { getPathCompletionItems, insertCodeIntoActiveEditor, openWorkspaceFile } from "@/vscodeApi/editor/EditorActions";
import { CHAT_VIEW_TYPE, SIDEBAR_VIEW_ID } from "@/shared/constants";
import { logWarning } from "@/shared/logging/Logger";
import { WEBVIEW_PROTOCOL_VERSION, type ReferencedFile, type WebviewToHandlerMessage } from "@/adapters";
import type { ReferencedFilePayload } from "@/vscodeApi/commands/ChatCommands";
import { isWebviewToHandlerMessage } from "./WebviewMessageValidation";
import { isUriInsideRoot } from "@/vscodeApi/workspace";
import { ChangeDiffViewer } from "@/vscodeApi/editor/diff/ChangeDiffViewer";

type ChatCommandMessage = { type: "addReferencedFiles"; files: ReferencedFilePayload[] } | { type: "setDraft"; text: string };

export class WebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = CHAT_VIEW_TYPE;

  private readonly chatHandler: ChatHandler;
  private readonly settingsHandler: SettingsHandler;
  private readonly historyHandler: HistoryHandler;
  private readonly historyManager: HistoryManager;
  private readonly changeDiffViewer: ChangeDiffViewer;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingMessages: ChatCommandMessage[] = [];
  private viewDisposables: vscode.Disposable[] = [];
  private webviewView?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {
    this.historyManager = new HistoryManager(this._context);
    this.changeDiffViewer = new ChangeDiffViewer();
    this.disposables.push(this.changeDiffViewer);
    this.chatHandler = new ChatHandler(this._context, this.historyManager);
    this.settingsHandler = new SettingsHandler(this._context, this.chatHandler);
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
    this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void this.chatHandler.handleWorkspaceFoldersChanged();
    }));

  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.disposeViewRegistrations();
    this.settingsHandler.handleWebviewRecreation();
    await this.chatHandler.discardIncognitoForWebviewRecreation();
    this.webviewView = webviewView;
    this.chatHandler.attachWebview(webviewView);
    const webviewDistUri = vscode.Uri.joinPath(this._extensionUri, "dist", "webview");
    const codiconsDistUri = vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode", "codicons", "dist");
    const devServerUrl = process.env.DEEPSEEK_COPILOT_WEBVIEW_DEV_SERVER;
    const codiconFontUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(codiconsDistUri, "codicon.ttf"));

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: devServerUrl ? [webviewDistUri, codiconsDistUri] : [webviewDistUri],
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
        : getHtmlContent(webviewView.webview, webviewDistUri);

    let protocolReady = false;
    this.viewDisposables.push(webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (isWebviewToHandlerMessage(message)) {
        if (message.type === "initializeProtocol") {
          protocolReady = message.protocolVersion === WEBVIEW_PROTOCOL_VERSION;
          void webviewView.webview.postMessage(protocolReady
            ? { type: "protocolReady", protocolVersion: WEBVIEW_PROTOCOL_VERSION }
            : { type: "protocolError", supportedVersion: WEBVIEW_PROTOCOL_VERSION, error: "Unsupported webview protocol version." });
          return;
        }
        if (!protocolReady) {
          void webviewView.webview.postMessage({
            type: "requestRejected",
            requestId: getMessageRequestId(message),
            action: message.type,
            error: "The webview protocol has not been initialized. Reload the view and try again.",
          });
          return;
        }
        this._routeMessage(message, webviewView);
      } else {
        logWarning("[WebviewProvider] Ignoring malformed webview message");
        void webviewView.webview.postMessage({
          type: "requestRejected",
          requestId: getUnknownRequestId(message),
          action: getUnknownMessageType(message),
          error: "The request was rejected because its payload is invalid or exceeds a supported limit.",
        });
      }
    }));
    this.viewDisposables.push(webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView) {
        this.webviewView = undefined;
      }
      this.chatHandler.detachWebview(webviewView);
      this.disposeViewRegistrations();
    }));

    await this.flushPendingMessages();
  }

  public dispose(): void {
    this.disposeViewRegistrations();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.webviewView = undefined;
  }

  public async initialize(): Promise<void> {
    try {
      await this.historyManager.initialize();
    } catch (error: unknown) {
      SettingsManager.enterDegradedMode(error);
      await vscode.window.showWarningMessage(
        "DeepSeek Copilot could not initialize persistent storage. Chat remains available in incognito mode; check access to the extension data directory and reload VS Code.",
      );
    }
    await this.chatHandler.initialize();
  }

  private disposeViewRegistrations(): void {
    const registrations = this.viewDisposables;
    this.viewDisposables = [];
    for (const registration of registrations) {
      registration.dispose();
    }
  }

  public async shutdown(): Promise<void> {
    await this.chatHandler.shutdown();
    this.dispose();
  }

  public async addReferencedFiles(files: ReferencedFilePayload[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    this.chatHandler.registerExternalContextFiles(files as ReferencedFile[]);
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
      case "getWorkspaceContext":
      case "rebindConversationWorkspace":
      case "openConversationWorkspace":
        this.chatHandler.handle(message, webviewView);
        break;

      case "selectContextFiles":
        void this.handleSelectContextFiles(message.conversationId, webviewView);
        break;

      case "getPathCompletions":
        void this.handlePathCompletions(message, webviewView);
        break;

      case "copyCode":
        void vscode.env.clipboard.writeText(message.code);
        break;

      case "insertCode":
        void this.withWorkspaceBinding(message.conversationId, message.workspaceRevision, (binding) =>
          insertCodeIntoActiveEditor(message.code, binding));
        break;

      case "selectModel":
        void webviewView.webview.postMessage({ type: "modelChanged", modelId: message.modelId });
        break;

      case "getConfig":
      case "saveConfig":
      case "resetConfig":
      case "resolveHistoryTransition":
      case "deleteApiKey":
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
        void this.withWorkspaceBinding(message.conversationId, message.workspaceRevision, (binding) =>
          openWorkspaceFile(message.path, binding, message.line));
        break;

      case "openFileDiff":
        void this.withWorkspaceBinding(message.conversationId, message.workspaceRevision, (binding) =>
          this.changeDiffViewer.open(message.path, message.diff, binding));
        break;

      default:
        logWarning("[WebviewProvider] Unknown message type");
    }
  }

  private async handlePathCompletions(
    message: Extract<WebviewToHandlerMessage, { type: "getPathCompletions" }>,
    webviewView: vscode.WebviewView,
  ): Promise<void> {
    const context = await this.chatHandler.getWorkspaceContext(message.conversationId);
    const items = context.state === "connected" && (!message.workspaceRevision || message.workspaceRevision === context.binding.revision)
      ? await getPathCompletionItems(message.query, context.binding)
      : [];
    await webviewView.webview.postMessage({
      type: "pathCompletions",
      requestId: message.requestId,
      query: message.query,
      workspaceRevision: context.binding.revision,
      items,
    });
  }

  private async withWorkspaceBinding(
    conversationId: string | undefined,
    workspaceRevision: string | undefined,
    operation: (binding: Awaited<ReturnType<ChatHandler["getWorkspaceContext"]>>["binding"]) => Promise<void>,
  ): Promise<void> {
    const context = await this.chatHandler.getWorkspaceContext(conversationId);
    if (context.state !== "connected" || (workspaceRevision && workspaceRevision !== context.binding.revision)) {
      await vscode.window.showErrorMessage("The chat workspace is no longer connected or has changed.");
      return;
    }
    await operation(context.binding);
  }

  private async handleSelectContextFiles(conversationId: string | undefined, webviewView: vscode.WebviewView): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      title: "Add context files",
      openLabel: "Add to chat",
    });
    if (!selected?.length) {
      return;
    }
    const context = await this.chatHandler.getWorkspaceContext(conversationId);
    const files: ReferencedFilePayload[] = [];
    for (const uri of selected.slice(0, 10)) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.File || stat.size > 1024 * 1024) {
          continue;
        }
        const bytes = vscode.workspace.fs.readFile(uri);
        const contentBytes = await bytes;
        if (looksBinary(contentBytes)) {
          continue;
        }
        const internalFolder = context.binding.folders.find((folder) => isUriInsideRoot(uri, vscode.Uri.parse(folder.uri)));
        const name = uri.path.split("/").pop() || "context-file";
        const sensitive = isSensitiveUri(uri);
        if (sensitive) {
          const choice = await vscode.window.showWarningMessage(
            `Add potentially sensitive file "${name}" as a read-only context snapshot?`,
            { modal: true },
            "Add snapshot",
          );
          if (choice !== "Add snapshot") {
            continue;
          }
        }
        const snapshotOnly = !internalFolder || sensitive;
        const relative = internalFolder ? relativeUriPath(vscode.Uri.parse(internalFolder.uri), uri) : undefined;
        files.push({
          referenceId: randomUUID(),
          path: snapshotOnly ? name : `./${context.binding.folders.length > 1 ? `${internalFolder!.alias}/` : ""}${relative}`,
          name,
          content: Buffer.from(contentBytes).toString("utf8"),
          language: name.includes(".") ? name.split(".").pop() : undefined,
          type: "file",
          size: stat.size,
          scope: snapshotOnly ? "external-snapshot" : "workspace",
          rootUri: snapshotOnly ? undefined : internalFolder!.uri,
          bindingRevision: snapshotOnly ? undefined : context.binding.revision,
        });
      } catch {
        // Ignore entries that disappear or become unreadable while the picker is open.
      }
    }
    this.chatHandler.registerExternalContextFiles(files as ReferencedFile[]);
    await webviewView.webview.postMessage({ type: "contextFilesSelected", files });
  }
}

function getMessageRequestId(message: WebviewToHandlerMessage): string | undefined {
  if ("clientRequestId" in message) {
    return message.clientRequestId;
  }
  if ("requestId" in message) {
    return String(message.requestId);
  }
  return undefined;
}

function getUnknownRequestId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { requestId?: unknown; clientRequestId?: unknown };
  const id = candidate.requestId ?? candidate.clientRequestId;
  return typeof id === "string" || typeof id === "number" ? String(id).slice(0, 512) : undefined;
}

function getUnknownMessageType(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" ? type.slice(0, 128) : undefined;
}

function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8_192).some((value) => value === 0);
}

function isSensitiveUri(uri: vscode.Uri): boolean {
  return /(^|[/\\.])(env(?:\.[^/\\]+)?|pem|key|p12|pfx|\.ssh|credentials?|secrets?|tokens?)([/\\.]|$)/i.test(uri.path);
}

function relativeUriPath(root: vscode.Uri, candidate: vscode.Uri): string | undefined {
  const relative = root.scheme === "file"
    ? path.relative(root.fsPath, candidate.fsPath)
    : path.posix.relative(root.path, candidate.path);
  if (relative === ".." || relative.startsWith("../") || relative.startsWith("..\\") || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.replace(/\\/g, "/");
}
