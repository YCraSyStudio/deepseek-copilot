import type { PhaseUsage, UsageAggregate, UsageCurrency, UsagePhase } from "@/shared/usage/Usage";
import { estimateAggregateCost, formatUsageCost, USAGE_PHASES } from "@/shared/usage/Usage";
import { getUiLocale, t } from "@webview/i18n";
import { useComposerPopover } from "./UseComposerPopover";
import { MODEL_OPTIONS } from "@/contracts/deepseek/Models";

interface UsagePickerProps {
  usage?: UsageAggregate;
  usageByModel?: readonly UsageAggregate[];
  currency?: UsageCurrency;
}

const PHASE_LABELS: Record<UsagePhase, Parameters<typeof t>[0]> = {
  primary: "chat.usage.phases.primary",
  tool_round: "chat.usage.phases.toolRound",
  completion_review: "chat.usage.phases.completionReview",
  progress_review: "chat.usage.phases.progressReview",
  security_review: "chat.usage.phases.securityReview",
  context_summary: "chat.usage.phases.contextSummary",
  file_compaction: "chat.usage.phases.fileCompaction",
  vision_analysis: "chat.usage.phases.visionAnalysis",
};

function UsagePicker({ usage, usageByModel = [], currency = "usd" }: UsagePickerProps) {
  const { open, rootRef, triggerRef, togglePopover } = useComposerPopover();
  const hasUsage = !!usage && usage.count > 0;

  return (
    <div className="usagePicker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`usageTrigger ${open ? "active" : ""}`}
        aria-label={t("chat.usage.conversation")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("chat.usage.conversation")}
        disabled={!hasUsage}
        onClick={togglePopover}
      >
        <span className="codicon codicon-pulse" aria-hidden="true" />
      </button>

      {open && usage ? <UsagePopover usage={usage} usageByModel={usageByModel} currency={currency} /> : null}
    </div>
  );
}

export function UsagePopover({ usage, usageByModel, currency = "usd" }: {
  usage: UsageAggregate;
  usageByModel: readonly UsageAggregate[];
  currency?: UsageCurrency;
}) {
  const reportedCost = estimateAggregateCost(usage, currency) ?? sumModelCosts(usageByModel, currency);
  const partialCost = reportedCost !== undefined && usage.reported < usage.count;
  const cacheRate = cacheHitRate(usage);
  const phases = USAGE_PHASES.flatMap((phase) => {
    const value = usage.byPhase[phase];
    return value ? [{ phase, value }] : [];
  });

  return (
    <section className="usagePopover" role="dialog" aria-label={t("chat.usage.conversation")}>
      <header className="usagePopoverHeader">
        <span className="usagePopoverTitle">{t("chat.usage.conversation")}</span>
        {usageByModel.length > 1 ? (
          <span className="usagePopoverModel">{t("chat.usage.models", { count: usageByModel.length })}</span>
        ) : usage.model ? (
          <span className="usagePopoverModel">{modelLabel(usage.model)}</span>
        ) : null}
      </header>

      <div className="usageHero">
        <UsageMetric label={t("chat.usage.total")} value={formatTokens(usage.totalTokens)} prominent />
        <UsageMetric label={t("chat.usage.cost")} value={formatCost(reportedCost, currency, partialCost)} prominent />
      </div>

      <div className="usageMetricGrid">
        <UsageMetric label={t("chat.usage.requests")} value={formatNumber(usage.count)} />
        <UsageMetric label={t("chat.usage.input")} value={formatTokens(usage.inputTokens)} />
        <UsageMetric label={t("chat.usage.output")} value={formatTokens(usage.outputTokens)} />
        {usage.reasoningTokens !== undefined ? (
          <UsageMetric label={t("chat.usage.reasoning")} value={formatTokens(usage.reasoningTokens)} />
        ) : null}
        {cacheRate !== undefined ? (
          <UsageMetric label={t("chat.usage.cacheHit")} value={`${cacheRate}%`} />
        ) : null}
      </div>

      {usage.reported < usage.count ? (
        <p className="usageNotice">
          <span className="codicon codicon-info" aria-hidden="true" />
          {t("chat.usage.partial", { reported: usage.reported, requests: usage.count })}
        </p>
      ) : null}

      {usageByModel.length > 1 ? (
        <div className="usageModels">
          <div className="usageSectionLabel">{t("chat.usage.byModel")}</div>
          {usageByModel.map((modelUsage, index) => (
            <ModelUsageRow key={modelUsage.model ?? `unknown-${index}`} usage={modelUsage} currency={currency} />
          ))}
        </div>
      ) : null}

      {phases.length > 0 ? (
        <div className="usagePhases">
          <div className="usageSectionLabel">{t("chat.usage.breakdown")}</div>
          {phases.map(({ phase, value }) => (
            <PhaseRow key={phase} phase={phase} usage={value} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ModelUsageRow({ usage, currency }: { usage: UsageAggregate; currency: UsageCurrency }) {
  const cost = estimateAggregateCost(usage, currency);
  return (
    <div className="usageModelRow">
      <div className="usageModelIdentity">
        <span className="usageModelName">{usage.model ? modelLabel(usage.model) : t("chat.usage.unknownModel")}</span>
        <span className="usageModelRequests">{formatNumber(usage.count)} {t("chat.usage.requests").toLocaleLowerCase()}</span>
      </div>
      <div className="usageModelValues">
        <span>{formatTokens(usage.totalTokens)}</span>
        <span>{formatCost(cost, currency, cost !== undefined && usage.reported < usage.count)}</span>
      </div>
    </div>
  );
}

function UsageMetric({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className={`usageMetric ${prominent ? "prominent" : ""}`}>
      <span className="usageMetricValue">{value}</span>
      <span className="usageMetricLabel">{label}</span>
    </div>
  );
}

function PhaseRow({ phase, usage }: { phase: UsagePhase; usage: PhaseUsage }) {
  const hitRate = cacheHitRate(usage);
  return (
    <div className="usagePhaseRow">
      <span>{t(PHASE_LABELS[phase])}</span>
      <span className="usagePhaseValues">
        {hitRate !== undefined ? (
          <span
            className="usagePhaseCache"
            title={t("chat.usage.cacheHit")}
            aria-label={`${t("chat.usage.cacheHit")} ${hitRate}%`}
          >
            {hitRate}%
          </span>
        ) : null}
        {formatTokens(usage.inputTokens)} <span aria-hidden="true">+</span> {formatTokens(usage.outputTokens)}
      </span>
    </div>
  );
}

/**
 * Cache-hit share of the input tokens a phase actually reports. Rendering it per
 * phase is what makes a serialized-prefix regression visible: the conversation
 * total hides it behind the primary phase's share.
 */
function cacheHitRate(usage: PhaseUsage): number | undefined {
  if (usage.cacheHitTokens === undefined || usage.cacheMissTokens === undefined) {
    return undefined;
  }
  const total = usage.cacheHitTokens + usage.cacheMissTokens;
  return total > 0 ? Math.round(usage.cacheHitTokens / total * 100) : undefined;
}

function formatTokens(value: number | undefined): string {
  if (value === undefined) {return t("chat.usage.unavailable");}
  return new Intl.NumberFormat(getUiLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(getUiLocale()).format(value);
}

function formatCost(value: number | undefined, currency: UsageCurrency, partial: boolean): string {
  return formatUsageCost(value, {
    currency,
    locale: getUiLocale(),
    unavailable: t("chat.usage.unavailable"),
    partial,
  });
}

function sumModelCosts(values: readonly UsageAggregate[], currency: UsageCurrency): number | undefined {
  if (values.length === 0) {return undefined;}
  const costs = values.map((value) => estimateAggregateCost(value, currency));
  return costs.every((cost): cost is number => cost !== undefined)
    ? Math.round(costs.reduce((sum, cost) => sum + cost, 0) * 1_000_000) / 1_000_000
    : undefined;
}

function modelLabel(model: string): string {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label.replace(/^DeepSeek\s+/i, "")
    ?? model.replace(/^deepseek-/i, "");
}

export default UsagePicker;
