import type { ToolCall } from "@/adapters";
import type { ConfirmationRequiredResult } from "@/core/tools/Types";

export interface DangerTrustScope {
  conversationId: string;
  workspaceUri: string;
  configFingerprint: string;
}

export class DangerTrustStore {
  private readonly keys = new Set<string>();

  isTrusted(scope: DangerTrustScope, toolCall: ToolCall, confirmation: ConfirmationRequiredResult): boolean {
    return canTrust(confirmation) && this.keys.has(createDangerTrustKey(scope, toolCall, confirmation));
  }

  trust(scope: DangerTrustScope, toolCall: ToolCall, confirmation: ConfirmationRequiredResult): void {
    if (canTrust(confirmation)) {
      this.keys.add(createDangerTrustKey(scope, toolCall, confirmation));
    }
  }

  clear(): void {
    this.keys.clear();
  }

  clearScope(scope: DangerTrustScope): void {
    const prefix = `${canonical(scope)}:`;
    for (const key of this.keys) {
      if (key.startsWith(prefix)) {
        this.keys.delete(key);
      }
    }
  }
}

function canTrust(confirmation: ConfirmationRequiredResult): boolean {
  return confirmation.dangerLevel !== "destructive";
}

function createDangerTrustKey(scope: DangerTrustScope, toolCall: ToolCall, confirmation: ConfirmationRequiredResult): string {
  const argumentsValue = parseArguments(toolCall.function.arguments);
  return `${canonical(scope)}:${canonical({
    toolName: toolCall.function.name,
    arguments: argumentsValue,
    dangerLevel: confirmation.dangerLevel,
    reasonCode: confirmation.reasonCode ?? "",
    command: confirmation.command ?? "",
    normalizedCommand: confirmation.normalizedCommand ?? "",
    cwd: confirmation.cwd ?? "",
    shell: confirmation.shell ?? "",
  })}`;
}

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
