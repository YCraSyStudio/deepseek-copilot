import type { AppConfig } from "@/adapters";

// SettingsConfig is an AppConfig alias for webview code.
export type SettingsConfig = AppConfig;

export type ApiKeyStatus = "missing" | "configured" | "testing";

export type UpdateConfigFn = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
export type SaveOnBlurFn = {
  <K extends keyof AppConfig>(key: K, value: AppConfig[K]): void;
  (patch: Partial<AppConfig>): void;
};
