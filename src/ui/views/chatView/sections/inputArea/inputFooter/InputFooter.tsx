import { useMemo } from "react";
import "./InputFooter.css";
import { MODEL_OPTIONS } from "@/adapters/deepseek/Models";
import ReferencedFilesChips from "./ReferencedFilesChips";
import type { ReferencedFile } from "./Types";
import type { PermissionMode, WorkspaceContextStatus } from "@/adapters";
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
  workspaceContext?: WorkspaceContextStatus;
  conversationId?: string;
};

const PERMISSION_MODES: readonly PermissionMode[] = ["chat", "read-only", "workspace", "full-access", "auto-approve"];

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
  workspaceContext,
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
    { value: "chat", label: t("tools.chat") },
    { value: "read-only", label: t("tools.readOnly") },
    { value: "workspace", label: t("tools.workspace") },
    { value: "full-access", label: t("tools.fullAccess") },
    { value: "auto-approve", label: t("tools.autoApprove") },
  ];

  return (
    <div className="inputFooter">
      <ReferencedFilesChips files={referencedFiles} onRemove={onRemoveReferencedFile ?? (() => undefined)} />
      <div className="inputFooterControls">
        <div className="inputFooterPrimaryControls">
          <button
            type="button"
            className="workspaceAttachButton"
            aria-label={t("chat.attachContext")}
            data-tooltip={t("chat.attachContext")}
            onClick={() => getVsCodeApi()?.postMessage({ type: "selectContextFiles", conversationId })}
          >
            <span className="codicon codicon-attach" aria-hidden="true" />
          </button>
          {workspaceContext ? (
            <span
              className={`workspaceBadge ${workspaceContext.state}`}
              data-tooltip={workspaceTooltip(workspaceContext)}
            >
              <span className="codicon codicon-root-folder" aria-hidden="true" />
              {workspaceContext.binding.name}
              {workspaceContext.state !== "connected" ? ` · ${t(`chat.workspaceState.${workspaceContext.state}`)}` : ""}
            </span>
          ) : null}
          {conversationId && workspaceContext?.state === "disconnected" ? (
            <button type="button" onClick={() => getVsCodeApi()?.postMessage({ type: "openConversationWorkspace", conversationId })}>
              {t("chat.openWorkspace")}
            </button>
          ) : null}
          {conversationId && workspaceContext && workspaceContext.state !== "connected" && workspaceContext.state !== "empty" ? (
            <button type="button" onClick={() => getVsCodeApi()?.postMessage({
              type: "rebindConversationWorkspace",
              conversationId,
              workspaceRevision: workspaceContext.binding.revision,
            })}>
              {t("chat.reassignWorkspace")}
            </button>
          ) : null}
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
              if (nextPermissionMode) {
                onPermissionModeChange(nextPermissionMode);
              }
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

function workspaceTooltip(context: WorkspaceContextStatus): string {
  const roots = context.binding.folders.map((folder) => `${folder.alias}: ${folder.name}`).join("\n");
  const unavailable = Object.entries(context.binding.capabilities)
    .filter(([, available]) => !available)
    .map(([name]) => name)
    .join(", ");
  return [roots, unavailable ? `${t("chat.unavailableCapabilities")}: ${unavailable}` : ""].filter(Boolean).join("\n");
}

export default InputFooter;
