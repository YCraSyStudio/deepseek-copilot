import { useCallback, useEffect, useRef, useState } from "react";
import { useVsCode } from "../contexts";
import { MODEL_OPTIONS } from "@/adapters/deepseek/Models";
import type { AppConfig, HandlerToWebviewMessage, PermissionMode } from "@/adapters";
import { shouldApplyConfigRevision } from "@webview/config/ConfigRevision";

/**
 * Converts the UI reasoning value to the config expected by the extension host.
 */
function reasoningToConfig(value: string): { thinkingMode: boolean; reasoningEffort?: "high" | "max" } {
  const thinkingMode = value !== "off";
  if (!thinkingMode) {
    return { thinkingMode };
  }
  const reasoningEffort = value === "max" ? ("max" as const) : ("high" as const);
  return { thinkingMode, reasoningEffort };
}

export function useChatConfig() {
  const vscode = useVsCode();

  const [reasoning, setReasoning] = useState<string>("high");
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0]?.value ?? "");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("default");
  const [historyEnabled, setHistoryEnabled] = useState<boolean | undefined>(undefined);
  const [usageBreakdown, setUsageBreakdown] = useState(false);
  const [isPermissionUpdatePending, setPermissionUpdatePending] = useState(false);
  const [configUpdateError, setConfigUpdateError] = useState<string | null>(null);

  const selectedModelRef = useRef(selectedModel);
  const reasoningRef = useRef(reasoning);
  const revisionRef = useRef(-1);
  const pendingPermissionRequestRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  useEffect(() => {
    reasoningRef.current = reasoning;
  }, [reasoning]);
  /**
   * Applies saved config from configLoaded without side effects inside useEffect.
   */
  const applySavedConfig = useCallback((config: { reasoning?: string; model?: string; permissionMode?: PermissionMode; historyEnabled?: boolean; usageBreakdown?: boolean }, revision?: number) => {
    if (revision !== undefined) {
      if (!shouldApplyConfigRevision(revisionRef.current, revision)) {
        return;
      }
      revisionRef.current = revision;
    }
    if (config.reasoning !== undefined) {
      setReasoning(config.reasoning);
      reasoningRef.current = config.reasoning;
    }
    if (config.model !== undefined) {
      setSelectedModel(config.model);
      selectedModelRef.current = config.model;
    }
    if (config.permissionMode !== undefined) {
      setPermissionMode(config.permissionMode);
    }
    if (config.historyEnabled !== undefined) {
      setHistoryEnabled(config.historyEnabled);
    }
    if (config.usageBreakdown !== undefined) {
      setUsageBreakdown(config.usageBreakdown);
    }
  }, []);

  const applyConfigUpdateResult = useCallback((message: Extract<HandlerToWebviewMessage, { type: "configUpdateResult" }>) => {
    applySavedConfig({
      reasoning: message.config.thinkingMode === false ? "off" : message.config.reasoningEffort === "max" ? "max" : "high",
      model: message.config.model,
      permissionMode: message.config.permissionMode,
      historyEnabled: message.config.historyEnabled,
      usageBreakdown: message.config.usageBreakdown,
    }, message.revision);
    if (pendingPermissionRequestRef.current === message.requestId) {
      pendingPermissionRequestRef.current = undefined;
      setPermissionUpdatePending(false);
      setConfigUpdateError(message.status === "error" ? (message.error ?? "Failed to apply permissions.") : null);
    }
  }, [applySavedConfig]);

  const handleReasoningChange = useCallback(
    (value: string) => {
      setReasoning(value);
      reasoningRef.current = value;
      const configUpdate = reasoningToConfig(value);
      vscode?.postMessage({ type: "saveConfig", requestId: crypto.randomUUID(), config: configUpdate });
    },
    [vscode],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      selectedModelRef.current = modelId;
      vscode?.postMessage({ type: "selectModel", modelId });
      vscode?.postMessage({ type: "saveConfig", requestId: crypto.randomUUID(), config: { model: modelId } });
    },
    [vscode],
  );

  const handlePermissionModeChange = useCallback(
    (value: PermissionMode) => {
      const requestId = crypto.randomUUID();
      setPermissionMode(value);
      setConfigUpdateError(null);
      setPermissionUpdatePending(true);
      pendingPermissionRequestRef.current = requestId;
      vscode?.postMessage({ type: "saveConfig", requestId, config: { permissionMode: value } });
    },
    [vscode],
  );

  return {
    selectedModel,
    reasoning,
    permissionMode,
    historyEnabled,
    usageBreakdown,
    isPermissionUpdatePending,
    configUpdateError,
    selectedModelRef,
    reasoningRef,
    applySavedConfig,
    applyConfigUpdateResult,
    handleReasoningChange,
    handleModelChange,
    handlePermissionModeChange,
  };
}
