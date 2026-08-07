import * as vscode from "vscode";
import type { HeadlessWebRuntime } from "./HeadlessWebRuntime";

let runtime: HeadlessWebRuntime | undefined;

export function configureWebRuntimeDiagnostics(value: HeadlessWebRuntime): void {runtime = value;}

export function getWebRuntimeDiagnostics(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration("yrs-dpsk-copilot");
  return {
    backend: "chromium-headless",
    nativeVsCodeTools: false,
    configuredEngine: config.get<string>("webSearch.engine") ?? "auto",
    configuredLocale: config.get<string>("webSearch.locale") ?? "auto",
    resolvedSystemLocale: Intl.DateTimeFormat().resolvedOptions().locale || vscode.env.language,
    runtime: runtime?.getDiagnostics() ?? { source: "unresolved", available: false },
    vscodeVersion: vscode.version,
  };
}
