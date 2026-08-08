import type { GeneralSectionProps } from "../model";
import { Toggle } from "@webview/components/settingsView";
import { t } from "@webview/i18n";

function GeneralSection({ config, updateConfig, saveOnBlur }: GeneralSectionProps) {
  return (
    <section className="settingsSection generalSection">
      <h3 className="sectionTitle">{t("settings.section.extension")}</h3>

      <div className="settingRow">
        <label htmlFor="interfaceLanguage">{t("settings.language.label")}</label>
        <select
          id="interfaceLanguage"
          value={config.interfaceLanguage}
          onChange={(event) => {
            const language = parseInterfaceLanguage(event.target.value);
            if (!language) {return;}
            updateConfig("interfaceLanguage", language);
            saveOnBlur("interfaceLanguage", language);
          }}
        >
          <option value="auto">{t("settings.language.auto")}</option>
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="zh">中文</option>
        </select>
      </div>

      <div className="settingRow">
        <label htmlFor="historyRetentionDays">{t("settings.history.retention")}</label>
        <input
          id="historyRetentionDays"
          type="number"
          min={0}
          max={3650}
          value={config.historyRetentionDays}
          disabled={!config.historyEnabled}
          onChange={(event) => updateBoundedInteger(event.currentTarget, 0, 3650, (value) => updateConfig("historyRetentionDays", value))}
          onBlur={(event) => updateBoundedInteger(event.currentTarget, 0, 3650, (value) => saveOnBlur("historyRetentionDays", value))}
        />
      </div>

      <Toggle
        label={t("settings.instructions.globalAgents")}
        id="includeHomeAgents"
        checked={config.includeHomeAgents}
        onToggle={(checked) => {
          updateConfig("includeHomeAgents", checked);
          saveOnBlur("includeHomeAgents", checked);
        }}
      />

      <h3 className="sectionTitle">{t("settings.usage.title")}</h3>

      <Toggle
        label={t("settings.usage.breakdown")}
        id="usageBreakdown"
        checked={config.usageBreakdown}
        onToggle={(checked) => {
          updateConfig("usageBreakdown", checked);
          saveOnBlur("usageBreakdown", checked);
        }}
      />

    </section>
  );
}

export default GeneralSection;

function updateBoundedInteger(input: HTMLInputElement, min: number, max: number, update: (value: number) => void): void {
  const value = input.valueAsNumber;
  if (Number.isInteger(value) && value >= min && value <= max) {update(value);}
}

function parseInterfaceLanguage(value: string): "auto" | "en" | "es" | "zh" | undefined {
  return value === "auto" || value === "en" || value === "es" || value === "zh" ? value : undefined;
}
