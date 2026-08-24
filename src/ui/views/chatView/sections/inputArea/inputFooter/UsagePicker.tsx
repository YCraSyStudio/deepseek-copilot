import type { PhaseUsage, UsageAggregate, UsagePhase } from "@/shared/usage/Usage";
import { estimateReportedUsageCost, USAGE_PHASES } from "@/shared/usage/Usage";
import { getUiLocale, t } from "@webview/i18n";
import { useComposerPopover } from "./UseComposerPopover";
import { MODEL_OPTIONS } from "@/contracts/deepseek/Models";

interface UsagePickerProps {
  usage?: UsageAggregate;
  usageByModel?: readonly UsageAggregate[];
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

function UsagePicker({ usage, usageByModel = [] }: UsagePickerProps) {
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

      {open && usage ? <UsagePopover usage={usage} usageByModel={usageByModel} /> : null}
    </div>
  );
}

function UsagePopover({ usage, usageByModel }: { usage: UsageAggregate; usageByModel: readonly UsageAggregate[] }) {
  const reportedCost = usage.costUsd ?? sumModelCosts(usageByModel);
  const partialCost = usage.costUsd === undefined && reportedCost !== undefined;
  const cacheTotal = (usage.cacheHitTokens ?? 0) + (usage.cacheMissTokens ?? 0);
  const cacheRate = cacheTotal > 0 && usage.cacheHitTokens !== undefined
    ? Math.round(usage.cacheHitTokens / cacheTotal * 100)
    : undefined;
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
        <UsageMetric label={t("chat.usage.cost")} value={formatCost(reportedCost, partialCost)} prominent />
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
            <ModelUsageRow key={modelUsage.model ?? `unknown-${index}`} usage={modelUsage} />
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

function ModelUsageRow({ usage }: { usage: UsageAggregate }) {
  const cost = usage.costUsd ?? estimateReportedUsageCost(usage);
  return (
    <div className="usageModelRow">
      <div className="usageModelIdentity">
        <span className="usageModelName">{usage.model ? modelLabel(usage.model) : t("chat.usage.unknownModel")}</span>
        <span className="usageModelRequests">{formatNumber(usage.count)} {t("chat.usage.requests").toLocaleLowerCase()}</span>
      </div>
      <div className="usageModelValues">
        <span>{formatTokens(usage.totalTokens)}</span>
        <span>{formatCost(cost, usage.costUsd === undefined && cost !== undefined)}</span>
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
  return (
    <div className="usagePhaseRow">
      <span>{t(PHASE_LABELS[phase])}</span>
      <span className="usagePhaseValues">
        {formatTokens(usage.inputTokens)} <span aria-hidden="true">+</span> {formatTokens(usage.outputTokens)}
      </span>
    </div>
  );
}

function formatTokens(value: number | undefined): string {
  if (value === undefined) {return t("chat.usage.unavailable");}
  return new Intl.NumberFormat(getUiLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(getUiLocale()).format(value);
}

function formatCost(value: number | undefined, partial: boolean): string {
  if (value === undefined) {return t("chat.usage.unavailable");}
  const formatted = new Intl.NumberFormat(getUiLocale(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2,
  }).format(value);
  return partial ? `≥ ${formatted}` : formatted;
}

function sumModelCosts(values: readonly UsageAggregate[]): number | undefined {
  if (values.length === 0) {return undefined;}
  const costs = values.map((value) => value.costUsd ?? estimateReportedUsageCost(value));
  return costs.every((cost): cost is number => cost !== undefined)
    ? Math.round(costs.reduce((sum, cost) => sum + cost, 0) * 1_000_000) / 1_000_000
    : undefined;
}

function modelLabel(model: string): string {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label.replace(/^DeepSeek\s+/i, "")
    ?? model.replace(/^deepseek-/i, "");
}

export default UsagePicker;
