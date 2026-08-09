import * as vscode from "vscode";
import type { SecretStore, SettingsRepository } from "@/application/ports";
import { logWarning } from "@/shared/logging/Logger";
import { redactSensitiveText } from "@/shared/security/Redaction";
import type { AppConfig, WebviewConfig, WebviewToHandlerMessage } from "@/contracts";
import { deepseekFetch } from "@/infrastructure/deepseek/client/DeepSeekFetch";
import { getApiOrigin, normalizeApiBaseUrl } from "@/shared/security/ApiOrigin";
import { toWebviewConfig } from "@/platform/vscode/webviews/WebviewConfig";
import type { ChatHandler } from "./chat/ChatHandler";

type SettingsMessage = Extract<WebviewToHandlerMessage, { type: "getConfig" | "saveConfig" | "resetConfig" | "resolveHistoryTransition" | "deleteApiKey" | "testConnection" }>;
type TestConnectionMessage = Extract<WebviewToHandlerMessage, { type: "testConnection" }>;

interface PendingHistoryTransition {
  requestId: string;
  operation: "save" | "reset";
  targetEnabled: boolean;
  phase: "stop-work" | "exit-incognito";
  config?: Partial<AppConfig>;
  webviewView: vscode.WebviewView;
  resolving?: boolean;
}

export class SettingsHandler {
  private pendingHistoryTransition?: PendingHistoryTransition;

  constructor(
    _context: vscode.ExtensionContext,
    private readonly chatHandler: ChatHandler,
    private readonly settings: SettingsRepository,
    private readonly secrets: SecretStore,
  ) {}

  handleWebviewRecreation(): void {
    const pending = this.pendingHistoryTransition;
    if (!pending) {return;}
    this.chatHandler.cancelHistoryTransition(pending.requestId);
    this.pendingHistoryTransition = undefined;
  }

  handle(message: SettingsMessage, webviewView: vscode.WebviewView): void {
    switch (message.type) {
      case "getConfig":
        void this.postCurrentConfig(webviewView);
        break;
      case "saveConfig":
        void this._saveConfig(message.requestId, message.config, webviewView);
        break;
      case "resetConfig":
        void this._resetConfig(message.requestId, webviewView);
        break;
      case "resolveHistoryTransition":
        void this._resolveHistoryTransition(message.requestId, message.decision, webviewView);
        break;
      case "deleteApiKey":
        void this._deleteApiKey(message.requestId, webviewView);
        break;
      case "testConnection":
        void this._testConnection(message, webviewView);
        break;
      default:
        logWarning("[SettingsHandler] Unknown message");
    }
  }

  async postCurrentConfig(webviewView: vscode.WebviewView): Promise<void> {
    try {
      const config = await this._getCurrentConfig();
      await webviewView.webview.postMessage({
        type: "configLoaded",
        revision: this.settings.getRevision(),
        config,
      });
      await this._postApiKeyStatus(webviewView, config.baseUrl);
    } catch (error: unknown) {
      logWarning(`[SettingsHandler] Failed to load settings: ${getErrorMessage(error)}`);
    }
  }

  private async _saveConfig(requestId: string, config: Partial<AppConfig>, webviewView: vscode.WebviewView): Promise<void> {
    const currentHistoryEnabled = this.settings.load().historyEnabled;
    if (config.historyEnabled !== undefined && config.historyEnabled !== currentHistoryEnabled) {
      await this._requestHistoryTransition({
        requestId,
        operation: "save",
        targetEnabled: config.historyEnabled,
        phase: "stop-work",
        config,
        webviewView,
      });
      return;
    }
    if (
      config.permissionMode === "full-access" &&
      this.settings.load().permissionMode !== "full-access" &&
      !await confirmGlobalFullAccess()
    ) {
      await this._postUpdateResult(webviewView, requestId, "save", "cancelled");
      return;
    }

    const currentConfig = this.settings.load();
    const targetBaseUrl = normalizeApiBaseUrl(config.baseUrl ?? currentConfig.baseUrl);
    const currentOrigin = getApiOrigin(currentConfig.baseUrl);
    const targetOrigin = getApiOrigin(targetBaseUrl);
    if (currentOrigin !== targetOrigin && !await confirmApiOriginChange(currentOrigin, targetOrigin)) {
      await this._postUpdateResult(webviewView, requestId, "save", "cancelled");
      return;
    }

    const replacement = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
    const credentialUpdated = replacement.length > 0;
    try {
      await this.secrets.migrateLegacyApiKey(currentConfig.baseUrl);
      if (credentialUpdated) {
        await this.secrets.setApiKey(targetBaseUrl, replacement);
      }
      await this.settings.save({ ...config, baseUrl: targetBaseUrl, apiKey: undefined });
      await this._postUpdateResult(webviewView, requestId, "save", "success", undefined, credentialUpdated);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, replacement ? [replacement] : []);
      logWarning(`[SettingsHandler] Failed to save settings: ${errorMessage}`);
      await this._postUpdateResult(webviewView, requestId, "save", "error", errorMessage);
    }
  }

  private async _resetConfig(requestId: string, webviewView: vscode.WebviewView): Promise<void> {
    const currentOrigin = getApiOrigin(this.settings.load().baseUrl);
    const defaultOrigin = getApiOrigin("https://api.deepseek.com");
    const originDetail = currentOrigin === defaultOrigin
      ? ""
      : ` The API destination will change from ${currentOrigin} to ${defaultOrigin}; any credential already saved for the default origin will become active.`;
    const confirmation = await vscode.window.showWarningMessage(
      "Reset all extension settings to their defaults?",
      { modal: true, detail: `API keys are stored separately per origin and will be preserved.${originDetail}` },
      "Reset settings",
    );
    if (confirmation !== "Reset settings") {
      await this._postUpdateResult(webviewView, requestId, "reset", "cancelled");
      return;
    }

    if (!this.settings.load().historyEnabled) {
      await this._requestHistoryTransition({
        requestId,
        operation: "reset",
        targetEnabled: true,
        phase: "stop-work",
        webviewView,
      });
      return;
    }

    try {
      await this.settings.reset();
      await this._postUpdateResult(webviewView, requestId, "reset", "success");
    } catch (error: unknown) {
      logWarning(`[SettingsHandler] Failed to reset settings: ${getErrorMessage(error)}`);
      await this._postUpdateResult(webviewView, requestId, "reset", "error", getErrorMessage(error));
    }
  }

  private async _requestHistoryTransition(pending: PendingHistoryTransition): Promise<void> {
    const counts = this.chatHandler.beginHistoryTransition(
      pending.requestId,
      pending.targetEnabled ? "exit-incognito" : "enter-incognito",
    );
    if (!counts) {
      await this._postUpdateResult(
        pending.webviewView,
        pending.requestId,
        pending.operation,
        "error",
        "Another incognito-mode change is already pending.",
      );
      return;
    }
    this.pendingHistoryTransition = pending;
    if (counts.activeGenerations > 0 || counts.queuedMessages > 0) {
      await this._postHistoryTransitionRequired(pending, counts);
      return;
    }
    await this._continueHistoryTransitionWithoutWork(pending);
  }

  private async _resolveHistoryTransition(
    requestId: string,
    decision: "stop" | "save" | "discard" | "cancel",
    webviewView: vscode.WebviewView,
  ): Promise<void> {
    const pending = this.pendingHistoryTransition;
    if (!pending || pending.requestId !== requestId || pending.webviewView !== webviewView) {
      return;
    }
    if (pending.resolving) {return;}
    pending.resolving = true;
    if (decision === "cancel") {
      this.pendingHistoryTransition = undefined;
      this.chatHandler.cancelHistoryTransition(requestId);
      await this._postUpdateResult(webviewView, requestId, pending.operation, "cancelled");
      return;
    }
    if (pending.phase === "stop-work") {
      if (decision !== "stop") {
        pending.resolving = false;
        return;
      }
      if (!pending.targetEnabled) {
        await this._commitEnterIncognito(pending);
        return;
      }
      await this.chatHandler.stopPendingWork();
      await this._continueHistoryTransitionWithoutWork(pending);
      return;
    }
    if (decision === "save" || decision === "discard") {
      await this._commitExitIncognito(pending, decision);
    } else {
      pending.resolving = false;
    }
  }

  private async _continueHistoryTransitionWithoutWork(pending: PendingHistoryTransition): Promise<void> {
    if (!pending.targetEnabled) {
      await this._commitEnterIncognito(pending);
      return;
    }
    if (this.chatHandler.hasIncognitoMessages()) {
      pending.phase = "exit-incognito";
      pending.resolving = false;
      this.chatHandler.setHistoryTransitionPhase("exit-incognito");
      await this._postHistoryTransitionRequired(pending, { activeGenerations: 0, queuedMessages: 0 });
      return;
    }
    await this._commitExitIncognito(pending, "discard");
  }

  private async _commitEnterIncognito(pending: PendingHistoryTransition): Promise<void> {
    try {
      await this._persistHistoryTransition(pending);
      await pending.webviewView.webview.postMessage({
        type: "configLoaded",
        revision: this.settings.getRevision(),
        config: await this._getCurrentConfig(),
      });
      await this.chatHandler.enterIncognito(pending.requestId);
      this.pendingHistoryTransition = undefined;
      await this._postUpdateResult(pending.webviewView, pending.requestId, pending.operation, "success");
    } catch (error: unknown) {
      this.pendingHistoryTransition = undefined;
      this.chatHandler.cancelHistoryTransition(pending.requestId);
      await this._postUpdateResult(pending.webviewView, pending.requestId, pending.operation, "error", getErrorMessage(error));
    }
  }

  private async _commitExitIncognito(
    pending: PendingHistoryTransition,
    decision: "save" | "discard",
  ): Promise<void> {
    try {
      await this._persistHistoryTransition(pending);
      if (decision === "save") {
        await this.chatHandler.promoteIncognito(pending.requestId);
      } else {
        this.chatHandler.discardIncognito(pending.requestId);
      }
      this.pendingHistoryTransition = undefined;
      await this._postUpdateResult(pending.webviewView, pending.requestId, pending.operation, "success");
    } catch (error: unknown) {
      await this.settings.save({ historyEnabled: false }).catch(() => undefined);
      this.pendingHistoryTransition = undefined;
      this.chatHandler.cancelHistoryTransition(pending.requestId);
      await this._postUpdateResult(pending.webviewView, pending.requestId, pending.operation, "error", getErrorMessage(error));
    }
  }

  private async _persistHistoryTransition(pending: PendingHistoryTransition): Promise<void> {
    if (pending.operation === "reset") {
      await this.settings.reset();
      return;
    }
    await this.settings.save({ ...pending.config, apiKey: undefined });
  }

  private async _postHistoryTransitionRequired(
    pending: PendingHistoryTransition,
    counts: { activeGenerations: number; queuedMessages: number },
  ): Promise<void> {
    await pending.webviewView.webview.postMessage({
      type: "historyTransitionRequired",
      requestId: pending.requestId,
      phase: pending.phase,
      direction: pending.targetEnabled ? "exit-incognito" : "enter-incognito",
      ...counts,
    });
  }

  private async _deleteApiKey(requestId: string, webviewView: vscode.WebviewView): Promise<void> {
    const baseUrl = this.settings.load().baseUrl;
    const origin = getApiOrigin(baseUrl);
    const confirmation = await vscode.window.showWarningMessage(
      "Remove the API credential?",
      {
        modal: true,
        detail: `The credential stored for ${origin} will be permanently removed. Credentials for other origins will not be affected.`,
      },
      "Remove credential",
    );
    if (confirmation !== "Remove credential") {
      await this._postApiKeyDeleteResult(webviewView, requestId, "cancelled");
      return;
    }

    try {
      await this.secrets.deleteApiKey(baseUrl);
      await this._postApiKeyDeleteResult(webviewView, requestId, "success");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logWarning(`[SettingsHandler] Failed to remove API credential: ${errorMessage}`);
      await this._postApiKeyDeleteResult(webviewView, requestId, "error", errorMessage);
    }
  }

  private async _getCurrentConfig(): Promise<WebviewConfig> {
    return toWebviewConfig(this.settings.load());
  }

  private async _postUpdateResult(
    webviewView: vscode.WebviewView,
    requestId: string,
    operation: "save" | "reset",
    status: "success" | "error" | "cancelled",
    error?: string,
    credentialUpdated?: boolean,
  ): Promise<void> {
    const config = await this._getCurrentConfig();
    await webviewView.webview.postMessage({
      type: "configUpdateResult",
      requestId,
      revision: this.settings.getRevision(),
      operation,
      status,
      config,
      error,
      credentialUpdated,
    });
    await this._postApiKeyStatus(webviewView, config.baseUrl);
  }

  private async _postApiKeyStatus(webviewView: vscode.WebviewView, baseUrl: string): Promise<void> {
    const apiKey = await this.secrets.getApiKey(baseUrl) ?? "";
    const status = apiKey ? "configured" : "missing";
    const keyPreview = apiKey ? getApiKeyPreview(apiKey) : undefined;

    await webviewView.webview.postMessage({ type: "apiKeyStatusSettings", status, keyPreview });
    await webviewView.webview.postMessage({ type: "apiKeyStatus", status, keyPreview });
  }

  private async _postApiKeyDeleteResult(
    webviewView: vscode.WebviewView,
    requestId: string,
    status: "success" | "error" | "cancelled",
    error?: string,
  ): Promise<void> {
    await webviewView.webview.postMessage({ type: "apiKeyDeleteResult", requestId, status, error });
    await this._postApiKeyStatus(webviewView, this.settings.load().baseUrl);
  }

  private async _testConnection(payload: TestConnectionMessage, webviewView: vscode.WebviewView): Promise<void> {
    const { baseUrl, model } = payload;
    const replacement = payload.apiKey?.trim();
    const apiKey = replacement || await this.secrets.getApiKey(baseUrl);
    if (!apiKey) {
      await webviewView.webview.postMessage({
        type: "connectionTestResult",
        success: false,
        error: "No API key is configured for this origin.",
      });
      return;
    }
    try {
      await deepseekFetch({
        pathOrUrl: "chat/completions",
        apiKey,
        baseUrl,
        requestInit: {
          method: "POST",
          body: JSON.stringify({ model: model || "deepseek-v4-flash", messages: [{ role: "user", content: "Hello" }], max_tokens: 2 }),
        },
      });

      webviewView.webview.postMessage({
        type: "connectionTestResult",
        success: true,
      });
    } catch (err: unknown) {
      webviewView.webview.postMessage({
        type: "connectionTestResult",
        success: false,
        error: getErrorMessage(err, [apiKey]),
      });
    }
  }

}

async function confirmApiOriginChange(currentOrigin: string, targetOrigin: string): Promise<boolean> {
  const accepted = await vscode.window.showWarningMessage(
    "Change the destination for API credentials?",
    {
      modal: true,
      detail: `Current origin: ${currentOrigin}\nNew origin: ${targetOrigin}\n\nCredentials are stored per origin and will not be copied to the new destination.`,
    },
    "Change origin",
  );
  return accepted === "Change origin";
}

async function confirmGlobalFullAccess(): Promise<boolean> {
  const accepted = await vscode.window.showWarningMessage(
    "Enable global full access?",
    {
      modal: true,
      detail: "This setting applies globally. Tools may read, modify, or delete files anywhere on this computer without confirmation. Terminal commands are not OS-sandboxed.",
    },
    "Enable full access",
  );
  return accepted === "Enable full access";
}

function getApiKeyPreview(apiKey: string): string {
  return apiKey.length >= 12 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "••••";
}

function getErrorMessage(err: unknown, sensitiveValues: readonly string[] = []): string {
  return redactSensitiveText(err, sensitiveValues);
}
