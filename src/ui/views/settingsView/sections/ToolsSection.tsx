import type { PermissionMode } from "@/contracts";
import { Toggle } from "@webview/components/settingsView";
import { t } from "@webview/i18n";
import type { ToolsSectionProps } from "../model";
import "./ToolsSection.css";

const PERMISSION_MODE_OPTIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: "default", label: t("tools.default"), description: t("tools.defaultDescription") },
  { value: "auto-approve", label: t("tools.autoApprove"), description: t("tools.autoApproveModeDescription") },
  { value: "full-access", label: t("tools.fullAccess"), description: t("tools.fullAccessDescription") },
];

function ToolsSection({ config, updateConfig, saveOnBlur, permissionUpdatePending = false }: ToolsSectionProps) {
  const selectedPermission = PERMISSION_MODE_OPTIONS.find((option) => option.value === config.permissionMode) ?? PERMISSION_MODE_OPTIONS[0];

  const updatePermissionMode = (permissionMode: PermissionMode) => {
    updateConfig("permissionMode", permissionMode);
    saveOnBlur("permissionMode", permissionMode);
  };

  return (
    <section className="settingsSection toolsSection">
      <h3 className="sectionTitle">{t("settings.tab.tools")}</h3>

      <div className="permissionModeRow">
        <label className="permissionModeLabel" htmlFor="permissionMode">{t("tools.permissionMode")}</label>
        <select
          id="permissionMode"
          className="permissionModeSelect"
          aria-label={t("tools.permissionMode")}
          aria-describedby="permissionModeDescription"
          value={config.permissionMode}
          disabled={permissionUpdatePending}
          aria-busy={permissionUpdatePending}
          onChange={(event) => {
            const permissionMode = parsePermissionMode(event.target.value);
            if (permissionMode) {updatePermissionMode(permissionMode);}
          }}
        >
          {PERMISSION_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <small id="permissionModeDescription" className="permissionModeDescription">{selectedPermission.description}</small>
      </div>

      <div className="webSearchSettings">
        <h4 className="subsectionTitle">{t("settings.webSearch.title")}</h4>
        <p className="settingsHint">{t("settings.webSearch.description")}</p>
        <Toggle
          id="webSearchEnabled"
          label={t("settings.webSearch.enabled")}
          checked={config.webSearchEnabled}
          onToggle={(enabled) => {
            updateConfig("webSearchEnabled", enabled);
            saveOnBlur("webSearchEnabled", enabled);
          }}
        />
        <div className="settingRow">
          <label htmlFor="webSearchEngine">{t("settings.webSearch.engine")}</label>
          <select
            id="webSearchEngine"
            value={config.webSearchEngine}
            disabled={!config.webSearchEnabled}
            onChange={(event) => {
              const engine = parseWebSearchEngine(event.currentTarget.value);
              if (!engine) {return;}
              updateConfig("webSearchEngine", engine);
              saveOnBlur("webSearchEngine", engine);
            }}
          >
            <option value="searxng">SearXNG</option>
            <option value="bing">Bing</option>
            <option value="google">Google</option>
            <option value="baidu">Baidu</option>
          </select>
        </div>
        {config.webSearchEngine === "searxng" && (
          <div className="settingRow searxngEndpointRow">
            <label htmlFor="searxngUrl">{t("settings.webSearch.searxngUrl")}</label>
            <input
              id="searxngUrl"
              type="url"
              spellCheck={false}
              value={config.searxngUrl}
              disabled={!config.webSearchEnabled}
              onChange={(event) => updateConfig("searxngUrl", event.currentTarget.value)}
              onBlur={(event) => saveOnBlur("searxngUrl", event.currentTarget.value)}
            />
            <small className="settingsHint">{t("settings.webSearch.searxngManagedHint")}</small>
          </div>
        )}
      </div>
    </section>
  );
}

export default ToolsSection;

function parsePermissionMode(value: string): PermissionMode | undefined {
  return PERMISSION_MODE_OPTIONS.find((option) => option.value === value)?.value;
}

function parseWebSearchEngine(value: string): ToolsSectionProps["config"]["webSearchEngine"] | undefined {
  return value === "bing" || value === "google" || value === "baidu" || value === "searxng" ? value : undefined;
}
