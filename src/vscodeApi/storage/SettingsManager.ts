import { existsSync, readFileSync } from "node:fs";
import type { AppConfig, InterfaceLanguage, PermissionMode, ToolExecutionMode, ToolExecutionModes } from "@/adapters";
import { MAX_OUTPUT_TOKENS } from "@/adapters";
import { DEEPSEEK_DEFAULTS } from "@/deepseekApi";
import { writeJsonFileAtomic } from "./JsonFileStorage";
import { getSettingsFilePath } from "./UserDataPaths";

type StoredSettingKey = Exclude<keyof AppConfig, "apiKey" | "userId">;
type StoredSettings = Pick<AppConfig, StoredSettingKey>;

const STORED_SETTING_KEYS = new Set<StoredSettingKey>([
  "interfaceLanguage",
  "baseUrl",
  "model",
  "thinkingMode",
  "reasoningEffort",
  "temperature",
  "topP",
  "maxTokens",
  "maxToolRounds",
  "maxConcurrentGenerations",
  "permissionMode",
  "toolExecutionModes",
  "autoContext",
  "historyEnabled",
  "historyRetentionDays",
  "includeHomeAgents",
  "enableBetaFeatures",
]);

export class SettingsManager {
  private static writeQueue: Promise<void> = Promise.resolve();

  static initialize(initialSettings: unknown = {}): Promise<void> {
    if (existsSync(getSettingsFilePath())) {
      return Promise.resolve();
    }
    const initialConfig = normalizeConfig(initialSettings);
    return SettingsManager.enqueueWrite(() => writeJsonFileAtomic(getSettingsFilePath(), toStoredSettings(initialConfig)));
  }

  static load(): AppConfig {
    const stored = readStoredSettings();
    return normalizeConfig(stored);
  }

  static save(partial: Partial<AppConfig>): Promise<void> {
    return SettingsManager.enqueueWrite(async () => {
      const current = SettingsManager.load();
      const next = { ...current };

      for (const [key, value] of Object.entries(partial)) {
        if (!isStoredSettingKey(key) || value === undefined) {
          continue;
        }
        Object.assign(next, { [key]: normalizeSettingValue(key, value) });
      }

      await writeJsonFileAtomic(getSettingsFilePath(), toStoredSettings(next));
    });
  }

  static reset(): Promise<void> {
    return SettingsManager.enqueueWrite(() => writeJsonFileAtomic(getSettingsFilePath(), toStoredSettings(DEEPSEEK_DEFAULTS)));
  }

  private static enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = SettingsManager.writeQueue.then(operation, operation);
    SettingsManager.writeQueue = next.catch(() => undefined);
    return next;
  }
}

function readStoredSettings(): unknown {
  try {
    return JSON.parse(readFileSync(getSettingsFilePath(), "utf8")) as unknown;
  } catch {
    return {};
  }
}

function normalizeConfig(value: unknown): AppConfig {
  const config = isRecord(value) ? value : {};
  return {
    interfaceLanguage: normalizeInterfaceLanguage(config.interfaceLanguage),
    apiKey: "",
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: normalizeNonEmptyString(config.model, DEEPSEEK_DEFAULTS.model),
    thinkingMode: normalizeBoolean(config.thinkingMode, DEEPSEEK_DEFAULTS.thinkingMode),
    reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
    temperature: clampNumber(config.temperature, 0, 2, DEEPSEEK_DEFAULTS.temperature),
    topP: clampNumber(config.topP, 0, 1, DEEPSEEK_DEFAULTS.topP),
    maxTokens: clampInteger(config.maxTokens, 1, MAX_OUTPUT_TOKENS, DEEPSEEK_DEFAULTS.maxTokens),
    maxToolRounds: clampInteger(config.maxToolRounds, 1, 20, DEEPSEEK_DEFAULTS.maxToolRounds),
    maxConcurrentGenerations: clampInteger(config.maxConcurrentGenerations, 1, 16, DEEPSEEK_DEFAULTS.maxConcurrentGenerations),
    permissionMode: normalizePermissionMode(config.permissionMode),
    toolExecutionModes: normalizeToolExecutionModes(config.toolExecutionModes),
    autoContext: normalizeBoolean(config.autoContext, DEEPSEEK_DEFAULTS.autoContext),
    historyEnabled: normalizeBoolean(config.historyEnabled, DEEPSEEK_DEFAULTS.historyEnabled),
    historyRetentionDays: clampInteger(config.historyRetentionDays, 0, 3650, DEEPSEEK_DEFAULTS.historyRetentionDays),
    includeHomeAgents: normalizeBoolean(config.includeHomeAgents, DEEPSEEK_DEFAULTS.includeHomeAgents),
    enableBetaFeatures: normalizeBoolean(config.enableBetaFeatures, DEEPSEEK_DEFAULTS.enableBetaFeatures),
  };
}

function toStoredSettings(config: AppConfig): StoredSettings {
  return {
    interfaceLanguage: config.interfaceLanguage,
    baseUrl: config.baseUrl,
    model: config.model,
    thinkingMode: config.thinkingMode,
    reasoningEffort: config.reasoningEffort,
    temperature: config.temperature,
    topP: config.topP,
    maxTokens: config.maxTokens,
    maxToolRounds: config.maxToolRounds,
    maxConcurrentGenerations: config.maxConcurrentGenerations,
    permissionMode: config.permissionMode,
    toolExecutionModes: config.toolExecutionModes,
    autoContext: config.autoContext,
    historyEnabled: config.historyEnabled,
    historyRetentionDays: config.historyRetentionDays,
    includeHomeAgents: config.includeHomeAgents,
    enableBetaFeatures: config.enableBetaFeatures,
  };
}

function isStoredSettingKey(key: string): key is StoredSettingKey {
  return STORED_SETTING_KEYS.has(key as StoredSettingKey);
}

function normalizeSettingValue(key: StoredSettingKey, value: unknown): unknown {
  if (key === "interfaceLanguage") {return normalizeInterfaceLanguage(value);}
  if (key === "toolExecutionModes") {return normalizeToolExecutionModes(value);}
  if (key === "permissionMode") {return normalizePermissionMode(value);}
  if (key === "reasoningEffort") {return normalizeReasoningEffort(value);}
  if (key === "thinkingMode" || key === "autoContext" || key === "historyEnabled" || key === "includeHomeAgents" || key === "enableBetaFeatures") {
    return normalizeBoolean(value, DEEPSEEK_DEFAULTS[key]);
  }
  if (key === "model") {return normalizeNonEmptyString(value, DEEPSEEK_DEFAULTS.model);}
  if (key === "baseUrl") {return normalizeBaseUrl(value);}
  if (key === "temperature") {return clampNumber(value, 0, 2, DEEPSEEK_DEFAULTS.temperature);}
  if (key === "topP") {return clampNumber(value, 0, 1, DEEPSEEK_DEFAULTS.topP);}
  if (key === "maxTokens") {return clampInteger(value, 1, MAX_OUTPUT_TOKENS, DEEPSEEK_DEFAULTS.maxTokens);}
  if (key === "maxToolRounds") {return clampInteger(value, 1, 20, DEEPSEEK_DEFAULTS.maxToolRounds);}
  if (key === "maxConcurrentGenerations") {return clampInteger(value, 1, 16, DEEPSEEK_DEFAULTS.maxConcurrentGenerations);}
  if (key === "historyRetentionDays") {return clampInteger(value, 0, 3650, DEEPSEEK_DEFAULTS.historyRetentionDays);}
  return value;
}

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
  return value === "auto" || value === "en" || value === "es" || value === "zh" ? value : DEEPSEEK_DEFAULTS.interfaceLanguage;
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string") {return DEEPSEEK_DEFAULTS.baseUrl;}
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {return DEEPSEEK_DEFAULTS.baseUrl;}
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEEPSEEK_DEFAULTS.baseUrl;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === "approve-for-me") {return "auto-approve";}
  return value === "chat" || value === "read-only" || value === "workspace" || value === "full-access" || value === "auto-approve" ? value : DEEPSEEK_DEFAULTS.permissionMode;
}

function normalizeToolExecutionModes(value: unknown): ToolExecutionModes {
  if (!isRecord(value)) {return DEEPSEEK_DEFAULTS.toolExecutionModes;}
  return Object.fromEntries(Object.entries(value).flatMap(([name, mode]) => {
    if (mode === "approve_for_me") {return [[name, "auto_approve" as const]];}
    return isToolExecutionMode(mode) ? [[name, mode]] : [];
  }));
}

function isToolExecutionMode(value: unknown): value is ToolExecutionMode {
  return value === "disabled" || value === "enabled" || value === "auto_approve";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeReasoningEffort(value: unknown): AppConfig["reasoningEffort"] {
  return value === "high" || value === "max" ? value : DEEPSEEK_DEFAULTS.reasoningEffort;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
