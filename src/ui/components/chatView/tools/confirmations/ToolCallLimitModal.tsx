import { useId } from "react";
import { t } from "@webview/i18n";
import { useDialogFocus } from "./UseDialogFocus";
import "./ToolCallConfirmationModal.css";

interface ToolCallLimitModalProps {
  limit: { completedRounds: number; batchSize: number } | null;
  onDecision: (decision: "continue" | "stop") => void;
  disabled?: boolean;
}

export default function ToolCallLimitModal({ limit, onDecision, disabled = false }: ToolCallLimitModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus(() => onDecision("stop"), limit ? `limit-${limit.completedRounds}` : "closed", Boolean(limit));

  if (!limit) {return null;}

  return (
    <div className="toolCallModalBackdrop" role="presentation">
      <section ref={dialogRef} className="toolCallModal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        <header className="toolCallModalHeader">
          <div>
            <h3 id={titleId}>{t("confirmations.toolCallLimitReached")}</h3>
            <p id={descriptionId}>{t("confirmations.toolCallLimitDescription", { rounds: limit.completedRounds, batchSize: limit.batchSize })}</p>
          </div>
        </header>
        <div className="toolCallDecisionRow">
          <button type="button" className="toolCallDecisionOption primary" disabled={disabled} data-dialog-initial-focus onClick={() => onDecision("continue")}>
            {t("confirmations.continueToolCalls")}
          </button>
          <button type="button" className="toolCallDecisionOption" disabled={disabled} onClick={() => onDecision("stop")}>
            {t("confirmations.stopToolCalls")}
          </button>
        </div>
      </section>
    </div>
  );
}
