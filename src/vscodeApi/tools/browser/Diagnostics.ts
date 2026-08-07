import * as vscode from "vscode";
import { getBrowserRuntimeMetrics } from "./BrowserMetrics";
import { IntegratedBrowserBridge } from "./IntegratedBrowserBridge";
import { createVsCodeBrowserToolHost } from "./VsCodeBrowserToolHost";

export function getIntegratedBrowserDiagnostics(): Record<string, unknown> {
  const bridge = new IntegratedBrowserBridge(createVsCodeBrowserToolHost());
  const capabilities = bridge.getCapabilities();
  return {
    available: capabilities.available,
    optimizedMode: capabilities.optimized,
    headlessSupported: capabilities.headless,
    chatToolsEnabled: capabilities.chatToolsEnabled,
    configuredEngine:
      bridge.getSearchEnginePreference() ?? bridge.getNativeSearchEnginePreference() ?? "auto",
    configuredLocale: bridge.getConfiguredLocale() ?? "auto",
    resolvedSystemLocale: bridge.getSystemLocale() ?? bridge.getVsCodeLanguage(),
    missingToolIds: capabilities.missingTools,
    missingOptimizedToolIds: capabilities.missingOptimizedTools,
    runtime: getBrowserRuntimeMetrics(),
    vscodeVersion: vscode.version,
  };
}
