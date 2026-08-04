import { existsSync, readFileSync } from "node:fs";
import type { AppConfig, InterfaceLanguage, PermissionMode, PermissionSnapshot, ToolExecutionMode, ToolExecutionModes } from "@/adapters";
import { MAX_OUTPUT_TOKENS } from "@/adapters";
import { DEEPSEEK_DEFAULTS } from "@/deepseekApi";
import { normalizeApiBaseUrlOrDefault } from "@/shared/security/ApiOrigin";
import type { UsageBudgets } from "@/shared/usage/Usage";
import { withFileLock, writeJsonFileAtomic } from "./JsonFileStorage";
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
  "usageBreakdown",
  "usageBudgets",
]);

export class SettingsManager {
  private static writeQueue: Promise<void> = Promise.resolve();
  private static currentConfig: AppConfig = normalizeConfig({});
  private static revision = 0;
  private static initialized = false;
  private static persistenceError?: string;
  private static pendingPermissionUpdates = 0;
  private static persistSettings: (settings: StoredSettings) => Promise<void> =
    (settings) => writeJsonFileAtomic(getSettingsFilePath(), settings);

  static async initialize(initialSettings: unknown = {}): Promise<void> {
    if (SettingsManager.initialized) {
      return;
    }
    try {
      await SettingsManager.enqueueWrite(() => withFileLock(getSettingsFilePath(), async () => {
        if (existsSync(getSettingsFilePath())) {
          const storedSettings = readStoredSettings();
          const normalizedConfig = normalizeConfig(storedSettings);
          if (
            isRecord(storedSettings) &&
            (storedSettings.permissionMode === "workspace" ||
              storedSettings.permissionMode === "chat" ||
              storedSettings.permissionMode === "enabled")
          ) {
            await SettingsManager.persistSettings(toStoredSettings(normalizedConfig));
          }
          SettingsManager.currentConfig = normalizedConfig;
          return;
        }
        const initialConfig = normalizeConfig(initialSettings);
        await SettingsManager.persistSettings(toStoredSettings(initialConfig));
        SettingsManager.currentConfig = initialConfig;
      }));
    } catch (error: unknown) {
      SettingsManager.currentConfig = { ...normalizeConfig(initialSettings), historyEnabled: false };
      SettingsManager.persistenceError = error instanceof Error ? error.message : String(error);
    }
    SettingsManager.initialized = true;
  }

  static getPersistenceError(): string | undefined {
    return SettingsManager.persistenceError;
  }

  static enterDegradedMode(error: unknown): void {
    SettingsManager.persistenceError = error instanceof Error ? error.message : String(error);
    SettingsManager.currentConfig = { ...SettingsManager.currentConfig, historyEnabled: false };
    SettingsManager.revision += 1;
  }

  static load(): AppConfig {
    return cloneConfig(SettingsManager.currentConfig);
  }

  static getRevision(): number {
    return SettingsManager.revision;
  }

  static isPermissionUpdatePending(): boolean {
    return SettingsManager.pendingPermissionUpdates > 0;
  }

  static async waitForPendingWrites(): Promise<void> {
    await SettingsManager.writeQueue;
  }

  static async capturePermissionSnapshot(workspaceTrusted: boolean): Promise<PermissionSnapshot> {
    await SettingsManager.waitForPendingWrites();
    const config = SettingsManager.load();
    const permissionMode = workspaceTrusted ? config.permissionMode : "default";
    const toolExecutionModes = Object.fromEntries(
      Object.entries(config.toolExecutionModes).map(([toolName, mode]) => [
        toolName,
        !workspaceTrusted && mode === "auto_approve" ? "enabled" : mode,
      ]),
    );
    const revision = SettingsManager.revision;
    return Object.freeze({
      revision,
      permissionMode,
      toolExecutionModes: Object.freeze(toolExecutionModes),
      workspaceTrusted,
      fingerprint: JSON.stringify({
        revision,
        permissionMode,
        toolExecutionModes: Object.fromEntries(Object.entries(toolExecutionModes).sort(([left], [right]) => left.localeCompare(right))),
        workspaceTrusted,
      }),
    });
  }

  static save(partial: Partial<AppConfig>): Promise<void> {
    if (SettingsManager.persistenceError) {
      const next = SettingsManager.load();
      for (const [key, value] of Object.entries(partial)) {
        if (!isStoredSettingKey(key) || value === undefined || key === "historyEnabled") {continue;}
        Object.assign(next, { [key]: normalizeSettingValue(key, value) });
      }
      SettingsManager.currentConfig = { ...normalizeConfig(next), historyEnabled: false };
      SettingsManager.revision += 1;
      return Promise.resolve();
    }
    return SettingsManager.enqueueMutation(isPermissionAffectingPatch(partial), async () => {
      await withFileLock(getSettingsFilePath(), async () => {
        const next = existsSync(getSettingsFilePath()) ? normalizeConfig(readStoredSettings()) : SettingsManager.load();
        for (const [key, value] of Object.entries(partial)) {
          if (!isStoredSettingKey(key) || value === undefined) {continue;}
          Object.assign(next, { [key]: normalizeSettingValue(key, value) });
        }
        await SettingsManager.persistSettings(toStoredSettings(next));
        SettingsManager.currentConfig = normalizeConfig(next);
        SettingsManager.revision += 1;
      });
    });
  }

  static reset(): Promise<void> {
    if (SettingsManager.persistenceError) {
      SettingsManager.currentConfig = { ...normalizeConfig(DEEPSEEK_DEFAULTS), historyEnabled: false };
      SettingsManager.revision += 1;
      return Promise.resolve();
    }
    return SettingsManager.enqueueMutation(true, async () => {
      await withFileLock(getSettingsFilePath(), async () => {
        const next = normalizeConfig(DEEPSEEK_DEFAULTS);
        await SettingsManager.persistSettings(toStoredSettings(next));
        SettingsManager.currentConfig = next;
        SettingsManager.revision += 1;
      });
    });
  }

  static setPersistenceForTests(persist?: (settings: unknown) => Promise<void>): void {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Test persistence override is only available in tests");
    }
    SettingsManager.persistSettings = persist
      ? (settings) => persist(settings)
      : (settings) => writeJsonFileAtomic(getSettingsFilePath(), settings);
  }

  private static enqueueMutation(permissionAffecting: boolean, operation: () => Promise<void>): Promise<void> {
    if (permissionAffecting) {
      SettingsManager.pendingPermissionUpdates += 1;
    }
    return SettingsManager.enqueueWrite(operation).finally(() => {
      if (permissionAffecting) {
        SettingsManager.pendingPermissionUpdates = Math.max(0, SettingsManager.pendingPermissionUpdates - 1);
      }
    });
  }

  private static enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = SettingsManager.writeQueue.then(operation, operation);
    SettingsManager.writeQueue = next.catch(() => undefined);
    return next;
  }
}

function cloneConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    toolExecutionModes: { ...config.toolExecutionModes },
  };
}

function isPermissionAffectingPatch(partial: Partial<AppConfig>): boolean {
  return Object.prototype.hasOwnProperty.call(partial, "permissionMode") ||
    Object.prototype.hasOwnProperty.call(partial, "toolExecutionModes");
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
    usageBreakdown: normalizeBoolean(config.usageBreakdown, DEEPSEEK_DEFAULTS.usageBreakdown),
    usageBudgets: normalizeUsageBudgets(config.usageBudgets),
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
    usageBreakdown: config.usageBreakdown,
    usageBudgets: config.usageBudgets,
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
  if (key === "thinkingMode" || key === "autoContext" || key === "historyEnabled" || key === "includeHomeAgents") {
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
  if (key === "usageBudgets") {return normalizeUsageBudgets(value);}
  return value;
}

function normalizeInterfaceLanguage(value: unknown): InterfaceLanguage {
  return value === "auto" || value === "en" || value === "es" || value === "zh" ? value : DEEPSEEK_DEFAULTS.interfaceLanguage;
}

function normalizeBaseUrl(value: unknown): string {
  return normalizeApiBaseUrlOrDefault(value, DEEPSEEK_DEFAULTS.baseUrl);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === "approve-for-me") {return "auto-approve";}
  if (value === "workspace") {return "full-access";}
  if (value === "chat" || value === "enabled") {return "default";}
  return value === "default" || value === "read-only" || value === "custom" ||
    value === "full-access" || value === "auto-approve"
    ? value
    : DEEPSEEK_DEFAULTS.permissionMode;
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

function normalizeUsageBudgets(value: unknown): UsageBudgets {
  const budgets = isRecord(value) ? value : {};
  return {
    auxiliaryCalls: clampInteger(budgets.auxiliaryCalls ?? budgets.auxiliaryTokens, 0, Number.MAX_SAFE_INTEGER, 0),
    cacheMissInputTokens: clampInteger(budgets.cacheMissInputTokens, 0, Number.MAX_SAFE_INTEGER, 0),
    outputTokens: clampInteger(budgets.outputTokens, 0, Number.MAX_SAFE_INTEGER, 0),
    totalCostUsd: clampNonNegativeNumber(budgets.totalCostUsd, 0),
  };
}

function clampNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Number.MAX_SAFE_INTEGER, value)
    : fallback;
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
