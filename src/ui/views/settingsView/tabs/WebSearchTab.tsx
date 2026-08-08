import { t } from "@webview/i18n";
import type { SaveOnBlurFn, SettingsConfig, UpdateConfigFn } from "../model";

interface WebSearchTabProps {
  config: SettingsConfig;
  updateConfig: UpdateConfigFn;
  saveOnBlur: SaveOnBlurFn;
}

function WebSearchTab({ config, updateConfig, saveOnBlur }: WebSearchTabProps) {
  return (
    <section className="settingsSection webSearchSection">
      <h3 className="sectionTitle">{t("settings.webSearch.title")}</h3>
      <p className="settingsHint">{t("settings.webSearch.description")}</p>

      <div className="settingRow">
        <label htmlFor="webSearchEngine">{t("settings.webSearch.engine")}</label>
        <select
          id="webSearchEngine"
          value={config.webSearchEngine}
          onChange={(event) => {
            const engine = parseWebSearchEngine(event.currentTarget.value);
            if (!engine) {return;}
            updateConfig("webSearchEngine", engine);
            saveOnBlur("webSearchEngine", engine);
          }}
        >
          <option value="bing">Bing</option>
          <option value="google">Google</option>
          <option value="baidu">Baidu</option>
        </select>
      </div>

    </section>
  );
}

function parseWebSearchEngine(value: string): SettingsConfig["webSearchEngine"] | undefined {
  return value === "bing" || value === "google" || value === "baidu" ? value : undefined;
}

export default WebSearchTab;
