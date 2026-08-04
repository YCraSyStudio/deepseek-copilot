import type { UsageAggregate } from "@/shared/usage/Usage";
import { t } from "@webview/i18n";

interface UsageBreakdownProps {
  usage: UsageAggregate;
  scope?: "generation" | "conversation";
}

const PHASE_ORDER = ["primary", "tool_round", "security_review", "context_summary", "file_compaction"] as const;

/**
 * Compact, redacted token/cost breakdown shown under an assistant message when
 * the "usage breakdown" setting is enabled. Contains only aggregate counts.
 */
function UsageBreakdown({ usage, scope = "generation" }: UsageBreakdownProps) {
  const phases = PHASE_ORDER
    .filter((phase) => usage.byPhase[phase])
    .map((phase) => {
      const phaseUsage = usage.byPhase[phase];
      return phaseUsage
        ? `${phase} ${phaseUsage.reported}/${phaseUsage.requests} ${formatTokens(phaseUsage.inputTokens)}/${formatTokens(phaseUsage.outputTokens)}`
        : "";
    })
    .filter(Boolean);

  return (
    <div
      className="messageUsage"
      role="note"
      aria-label={scope === "conversation" ? t("chat.usage.conversation") : t("chat.usage.title")}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem 1rem",
        fontSize: "0.8em",
        opacity: 0.75,
        marginTop: "0.35rem",
        paddingTop: "0.35rem",
        borderTop: "1px solid var(--vscode-widget-border, rgba(128,128,128,0.4))",
      }}
    >
      <span>{scope === "conversation" ? t("chat.usage.conversation") : t("chat.usage.title")}</span>
      <span>{t("chat.usage.requests")}: {usage.count}</span>
      <span>{t("chat.usage.reported")}: {usage.reported}/{usage.count}</span>
      <span>{t("chat.usage.input")}: {formatTokens(usage.inputTokens)}</span>
      <span>{t("chat.usage.output")}: {formatTokens(usage.outputTokens)}</span>
      <span>{t("chat.usage.reasoning")}: {formatTokens(usage.reasoningTokens)}</span>
      <span>{t("chat.usage.cacheHit")}: {formatTokens(usage.cacheHitTokens)}</span>
      <span>{t("chat.usage.cacheMiss")}: {formatTokens(usage.cacheMissTokens)}</span>
      <span>{t("chat.usage.total")}: {formatTokens(usage.totalTokens)}</span>
      <span>{t("chat.usage.cost")}: {typeof usage.costUsd === "number" ? `$${usage.costUsd.toFixed(6)}` : t("chat.usage.unavailable")}</span>
      {phases.length > 0 ? <span className="messageUsagePhases">{phases.join(" · ")}</span> : null}
    </div>
  );
}

function formatTokens(value: number | undefined): string {
  return value === undefined ? t("chat.usage.unavailable") : value.toLocaleString();
}

export default UsageBreakdown;
