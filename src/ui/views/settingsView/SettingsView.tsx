import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import "@vscode/codicons/dist/codicon.css";
import "./SettingsView.css";
import { ApiTab, GeneralTab, ToolsTab, WebSearchTab } from "./tabs";
import { getVsCodeApi } from "../../VsCodeApi";
import { DEFAULT_CONFIG, MODEL_OPTIONS, REASONING_EFFORT_OPTIONS, type ApiCredentialState, type SaveOnBlurFn, type SettingsConfig } from "./model";
import type { AvailableToolInfo, HandlerToWebviewMessage, ToolExecutionModes } from "@/contracts";
import { setInterfaceLanguage, t } from "@webview/i18n";
import { shouldApplyConfigRevision } from "@webview/config/ConfigRevision";

type SettingsTab = "general" | "api" | "tools" | "webSearch";
type Notification = { type: "error" | "success"; message: string };

function SettingsView() {
  const vscode = useMemo(() => getVsCodeApi(), []);
  const [config, setConfig] = useState<SettingsConfig>(DEFAULT_CONFIG);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiCredential, setApiCredential] = useState<ApiCredentialState | null>(null);
  const [tools, setTools] = useState<AvailableToolInfo[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [hasLoadedConfig, setHasLoadedConfig] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [permissionUpdatePending, setPermissionUpdatePending] = useState(false);
  const loadedRef = useRef(false);
  const revisionRef = useRef(-1);
  const pendingSecurityRequestsRef = useRef(new Set<string>());
  const tabRefs = useRef<Record<SettingsTab, HTMLButtonElement | null>>({ general: null, api: null, tools: null, webSearch: null });
  const effectiveToolExecutionModes = useMemo(() => normalizeToolExecutionModes(config.toolExecutionModes, tools), [config.toolExecutionModes, tools]);

  const applyConfig = useCallback((nextConfig: Partial<SettingsConfig>) => {
    setConfig((current) => ({ ...current, ...nextConfig }));
  }, []);

  const updateConfig = useCallback(<K extends keyof SettingsConfig>(key: K, value: SettingsConfig[K]) => {
    if (key === "interfaceLanguage") {setInterfaceLanguage(value as SettingsConfig["interfaceLanguage"]);}
    setConfig((current) => ({ ...current, [key]: value }));
  }, []);

  const saveOnBlur = useCallback((
    keyOrPatch: keyof SettingsConfig | Partial<SettingsConfig>,
    value?: SettingsConfig[keyof SettingsConfig],
  ) => {
      const patch = typeof keyOrPatch === "string" ? { [keyOrPatch]: value } : keyOrPatch;
      const requestId = crypto.randomUUID();
      if (
        Object.prototype.hasOwnProperty.call(patch, "permissionMode") ||
        Object.prototype.hasOwnProperty.call(patch, "toolExecutionModes")
      ) {
        pendingSecurityRequestsRef.current.add(requestId);
        setPermissionUpdatePending(true);
      }
      vscode?.postMessage({ type: "saveConfig", requestId, config: patch });
    },
    [vscode],
  ) as SaveOnBlurFn;

  const requestConfig = useCallback(() => {
    setLoadError(null);
    if (!loadedRef.current) {setHasLoadedConfig(false);}
    vscode?.postMessage({ type: "getConfig" });
  }, [vscode]);

  const selectTab = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.focus();
  }, []);

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const order: SettingsTab[] = ["general", "api", "tools", "webSearch"];
      const currentIndex = order.indexOf(activeTab);
      let nextTab: SettingsTab | undefined;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {nextTab = order[(currentIndex + 1) % order.length];}
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {nextTab = order[(currentIndex - 1 + order.length) % order.length];}
      if (event.key === "Home") {nextTab = order[0];}
      if (event.key === "End") {nextTab = order[order.length - 1];}
      if (!nextTab) {return;}
      event.preventDefault();
      selectTab(nextTab);
    },
    [activeTab, selectTab],
  );

  useEffect(() => {
    if (!vscode) {
      setLoadError(t("settings.unavailable"));
      return;
    }

    const handleMessage = (event: MessageEvent<HandlerToWebviewMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "configLoaded":
          if (!shouldApplyConfigRevision(revisionRef.current, message.revision)) {break;}
          revisionRef.current = message.revision;
          if (message.config.interfaceLanguage) {setInterfaceLanguage(message.config.interfaceLanguage);}
          applyConfig(message.config);
          loadedRef.current = true;
          setHasLoadedConfig(true);
          setLoadError(null);
          break;
        case "configUpdateResult":
          if (pendingSecurityRequestsRef.current.delete(message.requestId)) {
            setPermissionUpdatePending(pendingSecurityRequestsRef.current.size > 0);
          }
          if (shouldApplyConfigRevision(revisionRef.current, message.revision)) {
            revisionRef.current = message.revision;
            if (message.config.interfaceLanguage) {setInterfaceLanguage(message.config.interfaceLanguage);}
            applyConfig(message.config);
          }
          if (message.credentialUpdated) {
            setApiKeyDraft("");
            setApiCredential(null);
          }
          if (message.status === "success") {
            setNotification({ type: "success", message: message.operation === "reset" ? t("settings.reset.success") : t("settings.save.success") });
          } else if (message.status === "error") {
            setNotification({ type: "error", message: t("settings.save.error") });
            if (!loadedRef.current) {setLoadError(t("settings.load.error"));}
          } else {
            setNotification(null);
          }
          break;
        case "apiKeyStatusSettings":
          setApiCredential({ status: message.status, keyPreview: message.keyPreview });
          break;
        case "availableTools":
          setTools(message.tools);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    requestConfig();
    vscode.postMessage({ type: "getAvailableTools" });
    return () => window.removeEventListener("message", handleMessage);
  }, [vscode, applyConfig, requestConfig]);

  return (
    <div className="settingsView">
      <div className="settingsTabs" role="tablist" aria-label={t("settings.tabs.label")}>
        <button
          type="button"
          className={`settingsTab ${activeTab === "general" ? "active" : ""}`}
          role="tab"
          id="settings-tab-general"
          aria-controls="settings-panel-general"
          aria-selected={activeTab === "general"}
          tabIndex={activeTab === "general" ? 0 : -1}
          ref={(element) => { tabRefs.current.general = element; }}
          onClick={() => selectTab("general")}
          onKeyDown={handleTabKeyDown}
        >
          {t("settings.tab.general")}
        </button>
        <button
          type="button"
          className={`settingsTab ${activeTab === "api" ? "active" : ""}`}
          role="tab"
          id="settings-tab-api"
          aria-controls="settings-panel-api"
          aria-selected={activeTab === "api"}
          tabIndex={activeTab === "api" ? 0 : -1}
          ref={(element) => { tabRefs.current.api = element; }}
          onClick={() => selectTab("api")}
          onKeyDown={handleTabKeyDown}
        >
          {t("settings.tab.api")}
        </button>
        <button
          type="button"
          className={`settingsTab ${activeTab === "tools" ? "active" : ""}`}
          role="tab"
          id="settings-tab-tools"
          aria-controls="settings-panel-tools"
          aria-selected={activeTab === "tools"}
          tabIndex={activeTab === "tools" ? 0 : -1}
          ref={(element) => { tabRefs.current.tools = element; }}
          onClick={() => selectTab("tools")}
          onKeyDown={handleTabKeyDown}
        >
          {t("settings.tab.tools")}
        </button>
        <button
          type="button"
          className={`settingsTab ${activeTab === "webSearch" ? "active" : ""}`}
          role="tab"
          id="settings-tab-webSearch"
          aria-controls="settings-panel-webSearch"
          aria-selected={activeTab === "webSearch"}
          tabIndex={activeTab === "webSearch" ? 0 : -1}
          ref={(element) => { tabRefs.current.webSearch = element; }}
          onClick={() => selectTab("webSearch")}
          onKeyDown={handleTabKeyDown}
        >
          {t("settings.tab.webSearch")}
        </button>
      </div>

      <div
        className="settingsTabPanel"
        role="tabpanel"
        id={`settings-panel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
      >
        {!hasLoadedConfig && !loadError ? <div className="settingsState" role="status">{t("settings.loading")}</div> : null}
        {loadError ? (
          <div className="settingsState settingsError" role="alert">
            <span>{loadError}</span>
            <button type="button" className="btn-secondary" onClick={requestConfig}>{t("settings.retry")}</button>
          </div>
        ) : null}
        {hasLoadedConfig && activeTab === "general" ? (
          <GeneralTab config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />
        ) : null}
        {hasLoadedConfig && activeTab === "api" ? (
          <ApiTab
            config={config}
            apiKeyDraft={apiKeyDraft}
            credential={apiCredential}
            updateConfig={updateConfig}
            saveOnBlur={saveOnBlur}
            onApiKeyChange={setApiKeyDraft}
            onApiKeyBlur={(apiKey) => {
              const requestId = crypto.randomUUID();
              vscode?.postMessage({
                type: "saveConfig",
                requestId,
                config: { apiKey },
              });
            }}
            modelOptions={MODEL_OPTIONS}
            reasoningEffortOptions={REASONING_EFFORT_OPTIONS}
          />
        ) : null}
        {hasLoadedConfig && activeTab === "tools" ? (
          <ToolsTab
            config={{ ...config, toolExecutionModes: effectiveToolExecutionModes }}
            tools={tools}
            updateConfig={updateConfig}
            saveOnBlur={saveOnBlur}
            permissionUpdatePending={permissionUpdatePending}
          />
        ) : null}
        {hasLoadedConfig && activeTab === "webSearch" ? (
          <WebSearchTab config={config} updateConfig={updateConfig} saveOnBlur={saveOnBlur} />
        ) : null}
      </div>

      <button
        type="button"
        className="btn-secondary"
        onClick={() => {
          const requestId = crypto.randomUUID();
          pendingSecurityRequestsRef.current.add(requestId);
          setPermissionUpdatePending(true);
          vscode?.postMessage({ type: "resetConfig", requestId });
        }}
        disabled={!hasLoadedConfig || permissionUpdatePending}
      >
        {t("settings.reset.label")}
      </button>
      {permissionUpdatePending ? <div className="settingsState" role="status" aria-live="polite">{t("chat.applyingPermissions")}</div> : null}

      {notification ? (
        <div className={`notification ${notification.type}`} role={notification.type === "error" ? "alert" : "status"}>
          <span>{notification.message}</span>
          <button type="button" className="btn-icon" aria-label={t("settings.notification.dismiss")} onClick={() => setNotification(null)}>
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default SettingsView;

function normalizeToolExecutionModes(currentModes: ToolExecutionModes, tools: AvailableToolInfo[]): ToolExecutionModes {
  return Object.fromEntries(tools.map((tool) => [tool.name, currentModes[tool.name] ?? "enabled"]));
}
