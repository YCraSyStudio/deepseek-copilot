import { useMemo } from "react";
import "./InputFooter.css";
import { MODEL_OPTIONS } from "@/contracts/deepseek/Models";
import ReferencedFilesChips from "./ReferencedFilesChips";
import type { ReferencedFile } from "@/contracts";
import type { PermissionMode } from "@/contracts";
import { t } from "@webview/i18n";
import { getVsCodeApi } from "@webview/VsCodeApi";
import ModelReasoningPicker from "./ModelReasoningPicker";

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

const PERMISSION_MODES: readonly PermissionMode[] = ["default", "auto-approve", "full-access"];

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
    const compactOptions = MODEL_OPTIONS.map((option) => ({
      ...option,
      label: option.label.replace(/^DeepSeek\s+/i, ""),
    }));
    if (!selectedModel || compactOptions.some((option) => option.value === selectedModel)) {
      return compactOptions;
    }
    return [...compactOptions, { value: selectedModel, label: selectedModel }];
  }, [selectedModel]);

  const permissionOptions: Array<{ value: PermissionMode; label: string }> = [
    { value: "default", label: t("tools.default") },
    { value: "auto-approve", label: t("tools.autoApprove") },
    { value: "full-access", label: t("tools.fullAccess") },
  ];

  return (
    <div className="inputFooter">
      <ReferencedFilesChips files={referencedFiles} onRemove={onRemoveReferencedFile ?? (() => undefined)} />
      <div className="inputFooterControls">
        <div className="inputFooterPrimaryControls">
          <button
            type="button"
            className="attachmentPickerTrigger"
            aria-label={t("chat.attach")}
            onClick={() => getVsCodeApi()?.postMessage({
              type: "selectAttachments",
              requestId: crypto.randomUUID(),
              conversationId,
            })}
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
          <ModelReasoningPicker
            model={selectedModel}
            reasoning={reasoning}
            modelOptions={modelOptions}
            reasoningOptions={reasoningOptions}
            onModelChange={onModelChange}
            onReasoningChange={onReasoningChange}
          />
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
