import { resolveToolExecutionMode } from "@/adapters";
import type { PermissionMode, ToolExecutionMode, ToolExecutionModes } from "@/adapters";
import type { ToolsSectionProps } from "../model";
import "./ToolsSection.css";
import { t } from "@webview/i18n";

const PERMISSION_MODE_OPTIONS: Array<{ value: PermissionMode; label: string; description: string }> = [
  { value: "default", label: t("tools.default"), description: t("tools.defaultDescription") },
  { value: "read-only", label: t("tools.readOnly"), description: t("tools.readOnlyDescription") },
  { value: "auto-approve", label: t("tools.autoApprove"), description: t("tools.autoApproveModeDescription") },
  { value: "full-access", label: t("tools.fullAccess"), description: t("tools.fullAccessDescription") },
  { value: "custom", label: t("tools.custom"), description: t("tools.customDescription") },
];

const TOOL_MODE_OPTIONS: Array<{ value: ToolExecutionMode; label: string }> = [
  { value: "disabled", label: t("tools.disabled") },
  { value: "enabled", label: t("tools.enabled") },
  { value: "auto_approve", label: t("tools.autoApprove") },
];

function ToolsSection({ config, tools, updateConfig, saveOnBlur, permissionUpdatePending = false }: ToolsSectionProps) {
  const selectedPermission = PERMISSION_MODE_OPTIONS.find((option) => option.value === config.permissionMode) ?? PERMISSION_MODE_OPTIONS[0];

  const updatePermissionMode = (permissionMode: PermissionMode) => {
    updateConfig("permissionMode", permissionMode);
    saveOnBlur("permissionMode", permissionMode);
  };

  const updateToolMode = (toolName: string, mode: ToolExecutionMode) => {
    const baseModes = config.permissionMode === "custom"
      ? config.toolExecutionModes
      : Object.fromEntries(
          tools.map((tool) => [
            tool.name,
            resolveToolExecutionMode(config.permissionMode, tool.name, config.toolExecutionModes),
          ]),
        );
    const nextModes: ToolExecutionModes = {
      ...baseModes,
      [toolName]: mode,
    };

    if (config.permissionMode !== "custom") {
      updateConfig("permissionMode", "custom");
    }
    updateConfig("toolExecutionModes", nextModes);
    saveOnBlur({
      permissionMode: "custom",
      toolExecutionModes: nextModes,
    });
  };

  return (
    <section className="settingsSection toolsSection">
      <h3 className="sectionTitle">{t("settings.tab.tools")}</h3>

      <div className="permissionModeRow">
        <label className="permissionModeLabel" htmlFor="permissionMode">
          {t("tools.permissionMode")}
        </label>
        <select
          id="permissionMode"
          className="permissionModeSelect"
          aria-label={t("tools.permissionMode")}
          aria-describedby="permissionModeDescription permissionModeScope"
          value={config.permissionMode}
          disabled={permissionUpdatePending}
          aria-busy={permissionUpdatePending}
          onChange={(event) => {
            const permissionMode = parsePermissionMode(event.target.value);
            if (permissionMode) {updatePermissionMode(permissionMode);}
          }}
        >
          {PERMISSION_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <small id="permissionModeDescription" className="permissionModeDescription">{selectedPermission.description}</small>
      </div>

      <div className="toolsList" aria-label={t("tools.toolPermissions")}>
        {tools.length === 0 ? <div className="toolsEmptyState" role="status">{t("tools.noToolsAreAvailable")}</div> : null}
        {tools.map((tool) => {
          const mode = resolveToolExecutionMode(config.permissionMode, tool.name, config.toolExecutionModes);
          return (
            <div className="toolSettingRow" key={tool.name}>
              <span className="toolSettingInfo">
                <span
                  className="toolSettingTooltip"
                  tabIndex={0}
                  data-tooltip={tool.description}
                  data-tooltip-position="bottom"
                  data-tooltip-align="start"
                  aria-label={`${tool.name}: ${tool.description}`}
                >
                  <span className="toolSettingName">{tool.name}</span>
                  <span className="codicon codicon-question" aria-hidden="true" />
                </span>
              </span>

              <select
                className="toolModeSelect"
                aria-label={t("tools.nameMode", { name: tool.name })}
                aria-disabled={permissionUpdatePending}
                disabled={permissionUpdatePending}
                value={mode}
                onChange={(event) => {
                  const toolMode = parseToolExecutionMode(event.target.value);
                  if (toolMode) {updateToolMode(tool.name, toolMode);}
                }}
              >
                {TOOL_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ToolsSection;

function parsePermissionMode(value: string): PermissionMode | undefined {
  return PERMISSION_MODE_OPTIONS.find((option) => option.value === value)?.value;
}

function parseToolExecutionMode(value: string): ToolExecutionMode | undefined {
  return TOOL_MODE_OPTIONS.find((option) => option.value === value)?.value;
}
