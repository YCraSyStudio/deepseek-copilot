import * as vscode from "vscode";
import { SettingsManager, SecretsManager } from "@/vscodeApi/storage";
import { logWarning } from "@/shared/logging/Logger";
import type { AppConfig, WebviewToHandlerMessage } from "@/adapters";
import { deepseekFetch } from "@/deepseekApi/client/DeepSeekFetch";

type SettingsMessage = Extract<WebviewToHandlerMessage, { type: "getConfig" | "saveConfig" | "resetConfig" | "testConnection" }>;
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
      await this._postApiKeyStatus(webviewView, config.apiKey ?? "");
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

    try {
      // apiKey is stored only in SecretStorage, never in synchronized settings.
      if (Object.prototype.hasOwnProperty.call(config, "apiKey")) {
        if (config.apiKey) {
          await SecretsManager.setApiKey(this.context, config.apiKey);
        } else {
          await SecretsManager.deleteApiKey(this.context);
        }
      }
      await SettingsManager.save(config);
      await this._postUpdateResult(webviewView, requestId, "save", "success");
    } catch (error: unknown) {
      logWarning(`[SettingsHandler] Failed to save settings: ${getErrorMessage(error)}`);
      await this._postUpdateResult(webviewView, requestId, "save", "error", getErrorMessage(error));
    }
  }

  private async _resetConfig(requestId: string, webviewView: vscode.WebviewView): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      "Reset all extension settings to their defaults?",
      { modal: true, detail: "Your API key is stored separately and will be preserved." },
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

  private async _getCurrentConfig(): Promise<Partial<AppConfig>> {
    const config = SettingsManager.load();
    const apiKey = (await SecretsManager.getApiKey(this.context)) || "";
    return { ...config, apiKey };
  }

  private async _postUpdateResult(
    webviewView: vscode.WebviewView,
    requestId: string,
    operation: "save" | "reset",
    status: "success" | "error" | "cancelled",
    error?: string,
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
    });
    await this._postApiKeyStatus(webviewView, config.apiKey ?? "");
  }

  private async _postApiKeyStatus(webviewView: vscode.WebviewView, apiKey: string): Promise<void> {
    const status = apiKey ? "configured" : "missing";
    const keyPreview = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : undefined;

    await webviewView.webview.postMessage({ type: "apiKeyStatusSettings", status, keyPreview });
    await webviewView.webview.postMessage({ type: "apiKeyStatus", status, keyPreview });
  }

  private async _testConnection(payload: TestConnectionMessage, webviewView: vscode.WebviewView): Promise<void> {
    const { apiKey, baseUrl, model } = payload;
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
        error: getErrorMessage(err),
      });
    }
  }

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

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
