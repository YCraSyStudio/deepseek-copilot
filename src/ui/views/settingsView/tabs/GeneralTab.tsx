import { GeneralSection } from "../sections";
import type { SettingsConfig, UpdateConfigFn, SaveOnBlurFn } from "../model";

interface GeneralTabProps {
  config: SettingsConfig;
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
}

function GeneralTab({ config, updateConfig, saveOnBlur }: GeneralTabProps) {
  return <GeneralSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />;
}

export default GeneralTab;
