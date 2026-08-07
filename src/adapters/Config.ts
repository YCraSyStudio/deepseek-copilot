import { EMPTY_USAGE_BUDGETS, type UsageBudgets } from "@/shared/usage/Usage";

export type ToolExecutionMode = "disabled" | "enabled" | "auto_approve";
export type ToolExecutionModes = Record<string, ToolExecutionMode>;
export type PermissionMode = "default" | "read-only" | "custom" | "auto-approve" | "full-access";
export type InterfaceLanguage = "auto" | "en" | "es" | "zh";

export function resolveToolExecutionMode(
  permissionMode: PermissionMode,
  toolName: string,
  customModes: ToolExecutionModes,
): ToolExecutionMode {
  if (permissionMode === "custom") {
    return customModes[toolName] ?? "enabled";
  }
  if (permissionMode === "default") {
    return "enabled";
  }
  if (permissionMode === "read-only") {
    return ["read_file", "list_directory", "search_content", "search_web", "read_web"].includes(toolName)
      ? "auto_approve"
      : "enabled";
  }
  return "auto_approve";
}

export interface AppConfig {
  interfaceLanguage: InterfaceLanguage;
  apiKey: string;
  baseUrl: string;

  model: string;

  thinkingMode: boolean;
  reasoningEffort?: "high" | "max";

  temperature: number;
  topP: number;

  maxTokens: number;
  maxToolRounds: number;
  maxConcurrentGenerations: number;
  permissionMode: PermissionMode;
  toolExecutionModes: ToolExecutionModes;

  autoContext: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  includeHomeAgents: boolean;
  usageBreakdown: boolean;
  usageBudgets: UsageBudgets;

  userId?: string;
}

export interface PermissionSnapshot {
  revision: number;
  permissionMode: PermissionMode;
  toolExecutionModes: ToolExecutionModes;
  workspaceTrusted: boolean;
  fingerprint: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  interfaceLanguage: "auto",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  thinkingMode: true,
  reasoningEffort: "high",
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 8192,
  maxToolRounds: 6,
  maxConcurrentGenerations: 8,
  permissionMode: "default",
  toolExecutionModes: {},
  autoContext: false,
  historyEnabled: true,
  historyRetentionDays: 30,
  includeHomeAgents: false,
  usageBreakdown: false,
  usageBudgets: EMPTY_USAGE_BUDGETS,
};
