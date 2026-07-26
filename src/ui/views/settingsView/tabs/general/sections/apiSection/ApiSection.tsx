import "./ApiSection.css";
import type { ApiSectionProps } from "../index";
import { Toggle } from "@webview/components/settingsView";
import { useApiConnectionState } from "./UseApiConnectionState";
import { t } from "@webview/i18n";

function ApiSection({ config, updateConfig, saveOnBlur, modelOptions, reasoningEffortOptions, children }: ApiSectionProps) {
  const { apiKeyPreview, apiKeyStatusClass, handleApiKeyBlur, handleApiKeyChange, handleTestConnection, isTesting, showApiKey, toggleShowApiKey } =
    useApiConnectionState({ config, updateConfig, saveOnBlur });

  return (
    <section className="settingsSection apiSection">
      <h3 className="sectionTitle">{t("settings.api.title")}</h3>

      <div className="settingRow">
        <label htmlFor="apiKeyInput">{t("settings.api.key")}</label>
        <div className="inputWithAction">
          <input
            className={`apiKeyInput ${apiKeyStatusClass}`}
            id="apiKeyInput"
            type={showApiKey ? "text" : "password"}
            value={config.apiKey}
            placeholder="sk-..."
            spellCheck={false}
            onChange={handleApiKeyChange}
            onBlur={handleApiKeyBlur}
          />
          <button type="button" className="btn-icon apiKeyToggle" aria-label={t("settings.api.keyVisibility.label")} data-tooltip={t("settings.api.keyVisibility.tooltip")} data-tooltip-align="end" onClick={toggleShowApiKey}>
            {showApiKey ? <span className="codicon codicon-eye-closed" /> : <span className="codicon codicon-eye" />}
          </button>
        </div>

        <div className="statusRow">
          <span className={`statusIndicator ${apiKeyStatusClass}`}>{apiKeyPreview}</span>
          <button type="button" className="btn-secondary" onClick={handleTestConnection} disabled={isTesting || !config.apiKey}>
            {t("settings.api.testConnection")}
          </button>
        </div>
      </div>

      <div className="settingRow">
        <label htmlFor="modelSelectSettings">{t("settings.model.label")}</label>
        <select
          id="modelSelectSettings"
          value={config.model}
          onChange={(event) => {
            const model = event.target.value;
            if (!modelOptions.some((option) => option.value === model)) {return;}
            updateConfig("model", model);
            saveOnBlur("model", model);
          }}
        >
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Thinking Mode Toggle */}
      <Toggle
        id="thinkingModeToggle"
        label={t("settings.reasoning.mode")}
        checked={config.thinkingMode}
        onToggle={(checked) => {
          updateConfig("thinkingMode", checked);
          saveOnBlur("thinkingMode", checked);
        }}
      />

      {/* Reasoning effort, only when thinking mode is enabled. */}
      {config.thinkingMode && (
        <div className="settingRow">
          <label htmlFor="reasoningEffort">{t("settings.reasoning.effort")}</label>
          <select
            id="reasoningEffort"
            value={config.reasoningEffort}
            onChange={(event) => {
              const effort = reasoningEffortOptions.find((option) => option.value === event.target.value)?.value;
              if (!effort) {return;}
              updateConfig("reasoningEffort", effort);
              saveOnBlur("reasoningEffort", effort);
            }}
          >
            {reasoningEffortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>
      )}

      {children}
    </section>
  );
}

export default ApiSection;
