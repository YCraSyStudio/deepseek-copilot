import * as vscode from "vscode";
import { SettingsManager, SecretsManager } from "@/vscodeApi/storage";
import { logWarning } from "@/shared/logging/Logger";
import { redactSensitiveText } from "@/shared/security/Redaction";
import type { AppConfig, WebviewConfig, WebviewToHandlerMessage } from "@/adapters";
import { deepseekFetch } from "@/deepseekApi/client/DeepSeekFetch";
import { getApiOrigin, normalizeApiBaseUrl } from "@/shared/security/ApiOrigin";
import { toWebviewConfig } from "@/vscodeApi/webviews/WebviewConfig";

type SettingsMessage = Extract<WebviewToHandlerMessage, { type: "getConfig" | "saveConfig" | "resetConfig" | "deleteApiKey" | "testConnection" }>;
type TestConnectionMessage = Extract<WebviewToHandlerMessage, { type: "testConnection" }>;

export class SettingsHandler {
  constructor(private context: vscode.ExtensionContext) {}

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
        revision: SettingsManager.getRevision(),
        config,
      });
      await this._postApiKeyStatus(webviewView, config.baseUrl);
    } catch (error: unknown) {
      logWarning(`[SettingsHandler] Failed to load settings: ${getErrorMessage(error)}`);
    }
  }

  private async _saveConfig(requestId: string, config: Partial<AppConfig>, webviewView: vscode.WebviewView): Promise<void> {
    if (
      config.permissionMode === "full-access" &&
      SettingsManager.load().permissionMode !== "full-access" &&
      !await confirmGlobalFullAccess()
    ) {
      await this._postUpdateResult(webviewView, requestId, "save", "cancelled");
      return;
    }

    const currentConfig = SettingsManager.load();
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
      await SecretsManager.migrateLegacyApiKey(this.context, currentConfig.baseUrl);
      if (credentialUpdated) {
        await SecretsManager.setApiKey(this.context, targetBaseUrl, replacement);
      }
      await SettingsManager.save({ ...config, baseUrl: targetBaseUrl, apiKey: undefined });
      await this._postUpdateResult(webviewView, requestId, "save", "success", undefined, credentialUpdated);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error, replacement ? [replacement] : []);
      logWarning(`[SettingsHandler] Failed to save settings: ${errorMessage}`);
      await this._postUpdateResult(webviewView, requestId, "save", "error", errorMessage);
    }
  }

  private async _resetConfig(requestId: string, webviewView: vscode.WebviewView): Promise<void> {
    const currentOrigin = getApiOrigin(SettingsManager.load().baseUrl);
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

    try {
      await SettingsManager.reset();
      await this._postUpdateResult(webviewView, requestId, "reset", "success");
    } catch (error: unknown) {
      logWarning(`[SettingsHandler] Failed to reset settings: ${getErrorMessage(error)}`);
      await this._postUpdateResult(webviewView, requestId, "reset", "error", getErrorMessage(error));
    }
  }

  private async _deleteApiKey(requestId: string, webviewView: vscode.WebviewView): Promise<void> {
    const baseUrl = SettingsManager.load().baseUrl;
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
      await SecretsManager.deleteApiKey(this.context, baseUrl);
      await this._postApiKeyDeleteResult(webviewView, requestId, "success");
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logWarning(`[SettingsHandler] Failed to remove API credential: ${errorMessage}`);
      await this._postApiKeyDeleteResult(webviewView, requestId, "error", errorMessage);
    }
  }

  private async _getCurrentConfig(): Promise<WebviewConfig> {
    return toWebviewConfig(SettingsManager.load());
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
      revision: SettingsManager.getRevision(),
      operation,
      status,
      config,
      error,
      credentialUpdated,
    });
    await this._postApiKeyStatus(webviewView, config.baseUrl);
  }

  private async _postApiKeyStatus(webviewView: vscode.WebviewView, baseUrl: string): Promise<void> {
    const apiKey = await SecretsManager.getApiKey(this.context, baseUrl) ?? "";
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
    await this._postApiKeyStatus(webviewView, SettingsManager.load().baseUrl);
  }

  private async _testConnection(payload: TestConnectionMessage, webviewView: vscode.WebviewView): Promise<void> {
    const { baseUrl, model } = payload;
    const replacement = payload.apiKey?.trim();
    const apiKey = replacement || await SecretsManager.getApiKey(this.context, baseUrl);
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
