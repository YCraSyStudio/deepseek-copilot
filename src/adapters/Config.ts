export type ToolExecutionMode = "disabled" | "enabled" | "auto_approve";
export type ToolExecutionModes = Record<string, ToolExecutionMode>;
export type PermissionMode = "chat" | "read-only" | "workspace" | "full-access" | "auto-approve";
export type InterfaceLanguage = "auto" | "en" | "es" | "zh";
export type PermissionModeAllowedTools = readonly string[] | null;

export const PERMISSION_MODE_ALLOWED_TOOLS: Record<PermissionMode, PermissionModeAllowedTools> = {
  chat: [],
  "read-only": ["read_file", "list_directory", "search_content"],
  workspace: ["read_file", "list_directory", "search_content", "create_file", "edit_file", "apply_patch"],
  "full-access": null,
  "auto-approve": null,
};

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
  enableBetaFeatures: boolean;

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
  permissionMode: "read-only",
  toolExecutionModes: {},
  autoContext: false,
  historyEnabled: true,
  historyRetentionDays: 30,
  includeHomeAgents: false,
  enableBetaFeatures: false,
};
