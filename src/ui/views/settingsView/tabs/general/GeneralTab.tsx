import { AdvancedSection, ApiSection, GeneralSection } from "./sections";
import type { SettingsConfig, UpdateConfigFn, SaveOnBlurFn } from "../../settingsDataModels";
import type { AppConfig } from "@/adapters";
import type { TranslationKey } from "@webview/i18n/I18n";

interface GeneralTabProps {
  config: SettingsConfig;
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
  modelOptions: Array<{ value: string; label: string }>;
  reasoningEffortOptions: ReadonlyArray<{ value: NonNullable<AppConfig["reasoningEffort"]>; label: TranslationKey }>;
}

function GeneralTab({ config, updateConfig, saveOnBlur, modelOptions, reasoningEffortOptions }: GeneralTabProps) {
  return (
    <>
      <GeneralSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />

      <ApiSection
        config={config}
        updateConfig={updateConfig}
        saveOnBlur={saveOnBlur}
        modelOptions={modelOptions}
        reasoningEffortOptions={reasoningEffortOptions}
      >
        <AdvancedSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />
      </ApiSection>
    </>
  );
}

export default GeneralTab;
