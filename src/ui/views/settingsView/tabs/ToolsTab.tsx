import { ToolsSection } from "../sections";
import type { SettingsConfig, UpdateConfigFn, SaveOnBlurFn } from "../model";

interface ToolsTabProps {
  config: SettingsConfig;
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
  permissionUpdatePending?: boolean;
}

function ToolsTab({ config, updateConfig, saveOnBlur, permissionUpdatePending }: ToolsTabProps) {
  return <ToolsSection config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} permissionUpdatePending={permissionUpdatePending} />;
}

export default ToolsTab;
