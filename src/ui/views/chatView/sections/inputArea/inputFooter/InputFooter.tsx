import { useMemo } from "react";
import "./InputFooter.css";
import { MODEL_OPTIONS } from "@/adapters/deepseek/Models";
import ReferencedFilesChips from "./ReferencedFilesChips";
import type { ReferencedFile } from "./Types";
import type { PermissionMode } from "@/adapters";
import { t } from "@webview/i18n";
import { getVsCodeApi } from "@webview/VsCodeApi";

type Props = {
  reasoning: string;
  selectedModel: string;
  permissionMode: PermissionMode;
  permissionUpdatePending?: boolean;
  onReasoningChange: (value: string) => void;
  onModelChange: (modelId: string) => void;
  onPermissionModeChange: (value: PermissionMode) => void;
  /** Files referenced in the next chat request. */
  referencedFiles?: ReferencedFile[];
  /** Remove a referenced file. */
  onRemoveReferencedFile?: (index: number) => void;
  conversationId?: string;
};

const PERMISSION_MODES: readonly PermissionMode[] = ["default", "read-only", "auto-approve", "full-access", "custom"];

function parsePermissionMode(value: string): PermissionMode | undefined {
  return PERMISSION_MODES.find((mode) => mode === value);
}

function InputFooter({
  reasoning,
  selectedModel,
  permissionMode,
  permissionUpdatePending = false,
  onReasoningChange,
  onModelChange,
  onPermissionModeChange,
  referencedFiles = [],
  onRemoveReferencedFile,
  conversationId,
}: Props) {
  const reasoningOptions = useMemo(() => {
    return [{ value: "off", label: t("chat.off") }, { value: "high", label: t("chat.high") }, { value: "max", label: t("chat.max") }];
  }, []);

  const modelOptions = useMemo(() => {
    if (!selectedModel || MODEL_OPTIONS.some((option) => option.value === selectedModel)) {
      return MODEL_OPTIONS;
    }
    return [...MODEL_OPTIONS, { value: selectedModel, label: selectedModel }];
  }, [selectedModel]);

  const permissionOptions: Array<{ value: PermissionMode; label: string }> = [
    { value: "default", label: t("tools.default") },
    { value: "read-only", label: t("tools.readOnly") },
    { value: "auto-approve", label: t("tools.autoApprove") },
    { value: "full-access", label: t("tools.fullAccess") },
    { value: "custom", label: t("tools.custom") },
  ];

  return (
    <div className="inputFooter">
      <ReferencedFilesChips files={referencedFiles} onRemove={onRemoveReferencedFile ?? (() => undefined)} />
      <div className="inputFooterControls">
        <div className="inputFooterPrimaryControls">
          <span className="selectTooltipWrapper" data-tooltip={t("chat.modelSelector")}>
            <select name="ModelSelector" id="ModelSelector" aria-label={t("chat.modelSelector")} value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            </select>
          </span>
          <span className="selectTooltipWrapper" data-tooltip={t("chat.reasoning")}>
            <select name="Reasoning" id="Reasoning" aria-label={t("chat.reasoning")} value={reasoning} onChange={(event) => onReasoningChange(event.target.value)}>
            {reasoningOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            </select>
          </span>
          <button
            type="button"
            className="workspaceAttachButton"
            aria-label={t("chat.attachContext")}
            data-tooltip={t("chat.attachContext")}
            onClick={() => getVsCodeApi()?.postMessage({ type: "selectContextFiles", conversationId })}
          >
            <span className="codicon codicon-attach" aria-hidden="true" />
          </button>
        </div>
        <span className="selectTooltipWrapper" data-tooltip={t("tools.permissionMode")}>
          <select
            name="PermissionMode"
            id="PermissionMode"
            aria-label={t("tools.permissionMode")}
            aria-busy={permissionUpdatePending}
            disabled={permissionUpdatePending}
            value={permissionMode}
            onChange={(event) => {
              const nextPermissionMode = parsePermissionMode(event.target.value);
              if (nextPermissionMode) { onPermissionModeChange(nextPermissionMode); }
            }}
          >
            {permissionOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </span>
      </div>
    </div>
  );
}

export default InputFooter;
