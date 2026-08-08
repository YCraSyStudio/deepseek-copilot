import * as vscode from "vscode";
import { SettingsManager } from "@/vscodeApi/storage";
import type { HeadlessWebRuntime } from "./HeadlessWebRuntime";

let runtime: HeadlessWebRuntime | undefined;

export function configureWebRuntimeDiagnostics(value: HeadlessWebRuntime): void {runtime = value;}

export function getWebRuntimeDiagnostics(): Record<string, unknown> {
  const config = SettingsManager.load();
  return {
    backend: "chromium-headless",
    nativeVsCodeTools: false,
    configuredEngine: config.webSearchEngine,
    resolvedSystemLocale: Intl.DateTimeFormat().resolvedOptions().locale || vscode.env.language,
    runtime: runtime?.getDiagnostics() ?? { source: "unresolved", available: false },
    vscodeVersion: vscode.version,
  };
}
