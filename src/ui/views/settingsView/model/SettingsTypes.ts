import type { WebviewConfig } from "@/adapters";

export type SettingsConfig = WebviewConfig;

export type ApiKeyStatus = "missing" | "configured" | "testing";
export type ApiCredentialState = { status: "configured" | "missing"; keyPreview?: string };

export type UpdateConfigFn = <K extends keyof SettingsConfig>(
  key: K,
  value: SettingsConfig[K],
) => void;
export type SaveOnBlurFn = {
  <K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]): void;
  (patch: Partial<SettingsConfig>): void;
};
