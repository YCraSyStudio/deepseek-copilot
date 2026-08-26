import { DEEPSEEK_VISION_MODEL_ID } from "./deepseek/Models";

export type PermissionMode = "default" | "auto-approve" | "full-access";
export type InterfaceLanguage = "auto" | "en" | "es" | "zh";
export type WebSearchEngine = "bing" | "google" | "baidu" | "searxng";

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

  autoContext: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  includeHomeAgents: boolean;
  usageBreakdown: boolean;
  webSearchEnabled: boolean;
  webSearchEngine: WebSearchEngine;
  searxngUrl: string;

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
  maxToolRounds: 6,
  maxConcurrentGenerations: 8,
  permissionMode: "default",
  autoContext: false,
  historyEnabled: true,
  historyRetentionDays: 30,
  includeHomeAgents: false,
  usageBreakdown: false,
  webSearchEnabled: true,
  webSearchEngine: "bing",
  searxngUrl: "http://127.0.0.1:8888",
};
