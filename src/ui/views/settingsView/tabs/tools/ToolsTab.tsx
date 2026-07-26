import type { AvailableToolInfo } from "@/adapters";
import { ToolsSection } from "./sections";
import type { SettingsConfig, UpdateConfigFn, SaveOnBlurFn } from "../../settingsDataModels";

interface ToolsTabProps {
  config: SettingsConfig;
  tools: AvailableToolInfo[];
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
  permissionUpdatePending?: boolean;
}

function ToolsTab({ config, tools, updateConfig, saveOnBlur, permissionUpdatePending }: ToolsTabProps) {
  return <ToolsSection config={config} tools={tools} updateConfig={updateConfig} saveOnBlur={saveOnBlur} permissionUpdatePending={permissionUpdatePending} />;
}

export default ToolsTab;
