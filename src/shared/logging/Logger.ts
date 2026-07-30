import { redactSensitiveText } from "@/shared/security/Redaction";

export function logWarning(message: string): void {
  // Intentionally silent: console.* in the extension host can force VS Code to
  // create output channels during reload/shutdown, which may hit disposed stores.
  void redactDiagnostic(message);
}

export function logError(message: string, error?: unknown): void {
  // Keep extension-host logging side-effect free until a managed logger exists.
  void redactDiagnostic(message, error);
}

export function redactDiagnostic(message: string, error?: unknown): string {
  const detail = error === undefined ? "" : `: ${redactSensitiveText(error)}`;
  return `${redactSensitiveText(message)}${detail}`;
}
