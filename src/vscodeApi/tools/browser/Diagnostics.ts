import * as vscode from "vscode";
import { IntegratedBrowserBridge } from "./IntegratedBrowserBridge";
import { createVsCodeBrowserToolHost } from "./VsCodeBrowserToolHost";

export function getIntegratedBrowserDiagnostics(): Record<string, unknown> {
  const bridge = new IntegratedBrowserBridge(createVsCodeBrowserToolHost());
  const capabilities = bridge.getCapabilities();
  return {
    available: capabilities.available,
    headlessSupported: capabilities.headless,
    chatToolsEnabled: capabilities.chatToolsEnabled,
    configuredEngine:
      bridge.getSearchEnginePreference() ?? bridge.getNativeSearchEnginePreference() ?? "auto",
    missingToolIds: capabilities.missingTools,
    vscodeVersion: vscode.version,
  };
}
