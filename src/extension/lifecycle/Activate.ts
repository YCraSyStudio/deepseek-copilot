import * as vscode from "vscode";
import type { AppConfig } from "@/adapters";
import { CONFIG_SECTION, INCLUDE_HOME_AGENTS_KEY } from "@/shared/constants";
import { registerExtensionApi } from "@/vscodeApi/activation/RegisterExtensionApi";
import { SettingsManager, SecretsManager } from "@/vscodeApi/storage";
import { WebviewProvider } from "@/vscodeApi/webviews/WebviewProvider";
import { setActiveProvider } from "./ExtensionRuntime";

type LegacySettingKey = Exclude<keyof AppConfig, "apiKey" | "userId" | "includeHomeAgents" | "interfaceLanguage"> | "responseFormat";

const LEGACY_SETTING_KEYS: ReadonlyArray<LegacySettingKey> = [
  "baseUrl",
  "model",
  "thinkingMode",
  "reasoningEffort",
  "temperature",
  "topP",
  "maxTokens",
  "maxToolRounds",
  "maxConcurrentGenerations",
  "responseFormat",
  "permissionMode",
  "toolExecutionModes",
  "autoContext",
  "historyEnabled",
  "historyRetentionDays",
  "enableBetaFeatures",
];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await initializeUserSettings();
  await SecretsManager.migrateLegacyApiKey(context, SettingsManager.load().baseUrl);
  const provider = new WebviewProvider(context.extensionUri, context);
  setActiveProvider(provider);
  await provider.initialize();
  registerExtensionApi(context, provider);
}

async function initializeUserSettings(): Promise<void> {
  const legacyConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const initialSettings = Object.fromEntries(LEGACY_SETTING_KEYS.map((key) => [key, legacyConfig.get(key)]));
  initialSettings.includeHomeAgents = legacyConfig.get(INCLUDE_HOME_AGENTS_KEY);
  await SettingsManager.initialize(initialSettings);

  const removals: Thenable<void>[] = [];
  for (const key of [...LEGACY_SETTING_KEYS, INCLUDE_HOME_AGENTS_KEY]) {
    const inspected = legacyConfig.inspect(key);
    if (inspected?.globalValue !== undefined) {
      removals.push(legacyConfig.update(key, undefined, vscode.ConfigurationTarget.Global));
    }
    if (inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined) {
      removals.push(legacyConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace));
    }
  }
  await Promise.all(removals);
}
