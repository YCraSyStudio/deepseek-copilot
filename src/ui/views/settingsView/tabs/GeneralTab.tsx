import { AdvancedSection, ApiSection, GeneralSection } from "../sections";
import type { ApiCredentialState, SettingsConfig, UpdateConfigFn, SaveOnBlurFn } from "../model";
import type { TranslationKey } from "@webview/i18n/I18n";

interface GeneralTabProps {
  config: SettingsConfig;
  apiKeyDraft: string;
  credential: ApiCredentialState | null;
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: (value: string) => void;
  modelOptions: Array<{ value: string; label: string }>;
  reasoningEffortOptions: ReadonlyArray<{ value: NonNullable<SettingsConfig["reasoningEffort"]>; label: TranslationKey }>;
}

function GeneralTab({ config, apiKeyDraft, credential, updateConfig, saveOnBlur, onApiKeyChange, onApiKeyBlur, modelOptions, reasoningEffortOptions }: GeneralTabProps) {
  return (
    <>
      <GeneralSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />

      <ApiSection
        config={config}
        apiKeyDraft={apiKeyDraft}
        credential={credential}
        updateConfig={updateConfig}
        saveOnBlur={saveOnBlur}
        onApiKeyChange={onApiKeyChange}
        onApiKeyBlur={onApiKeyBlur}
        modelOptions={modelOptions}
        reasoningEffortOptions={reasoningEffortOptions}
      >
        <AdvancedSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />
      </ApiSection>
    </>
  );
}

export default GeneralTab;
