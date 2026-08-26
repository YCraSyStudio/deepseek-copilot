import { DEEPSEEK_VISION_MODEL_ID } from "./deepseek/Models";

export type PermissionMode = "default" | "auto-approve" | "full-access";
export type InterfaceLanguage = "auto" | "en" | "es" | "zh";
/** @deprecated SearXNG is now the only web-search provider. */
export type WebSearchEngine = "searxng";

export interface SearxngEngineOption {
  name: string;
  shortcut: string;
  categories: string[];
  enabled: boolean;
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
  maxConcurrentGenerations: number;
  permissionMode: PermissionMode;

  autoContext: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  includeHomeAgents: boolean;
  usageBreakdown: boolean;
  webSearchEnabled: boolean;
  /** @deprecated Preserved for persisted-config compatibility. */
  webSearchEngine: WebSearchEngine;
  searxngUrl: string;
  /** SearXNG engine shortcuts. Empty means use the instance defaults. */
  searxngEngines: string[];
  /** Cached engine metadata obtained from the configured SearXNG instance. */
  searxngEngineCatalog: SearxngEngineOption[];

  userId?: string;
}

export interface PermissionSnapshot {
  revision: number;
  permissionMode: PermissionMode;
  workspaceTrusted: boolean;
  fingerprint: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  interfaceLanguage: "auto",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: DEEPSEEK_VISION_MODEL_ID,
  thinkingMode: true,
  reasoningEffort: "high",
  temperature: 1.0,
  topP: 1.0,
  maxTokens: 8192,
  maxConcurrentGenerations: 8,
  permissionMode: "default",
  autoContext: false,
  historyEnabled: true,
  historyRetentionDays: 30,
  includeHomeAgents: false,
  usageBreakdown: false,
  webSearchEnabled: true,
  webSearchEngine: "searxng",
  searxngUrl: "http://127.0.0.1:8888",
  searxngEngines: [],
  searxngEngineCatalog: [],
};
