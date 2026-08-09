import { getApiOrigin } from "@/shared/security/ApiOrigin";

/**
 * Privacy-safe provider usage. Only aggregate counts, phase labels, model IDs,
 * and a price-catalog version cross the persistence and webview boundaries.
 */
export const USAGE_SCHEMA_VERSION = 1;
export const PRICE_CATALOG_VERSION = 1;

export interface ProviderUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Normalized from usage.completion_tokens_details.reasoning_tokens. */
  reasoning_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export type UsagePhase =
  | "primary"
  | "tool_round"
  | "security_review"
  | "context_summary"
  | "file_compaction";

export const USAGE_PHASES: readonly UsagePhase[] = [
  "primary",
  "tool_round",
  "security_review",
  "context_summary",
  "file_compaction",
];

export interface PhaseUsage {
  /** Provider requests attempted in this phase, including requests with no valid usage payload. */
  requests: number;
  /** Requests for which the provider returned valid required usage fields. */
  reported: number;
  reasoningReported: number;
  cacheHitReported: number;
  cacheMissReported: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  totalTokens?: number;
}

export interface UsageAggregate extends PhaseUsage {
  schemaVersion: typeof USAGE_SCHEMA_VERSION;
  /** True only for the official DeepSeek origin. */
  officialEndpoint: boolean;
  model?: string;
  priceCatalogVersion?: typeof PRICE_CATALOG_VERSION;
  currency?: "USD";
  /** Present only when every request has enough authoritative usage to price it. */
  costUsd?: number;
  /** Backwards-compatible request count used by persisted/webview consumers. */
  count: number;
  byPhase: Partial<Record<UsagePhase, PhaseUsage>>;
  /** Set when a persisted numeric counter reached JavaScript's safe-integer ceiling. */
  saturated?: true;
}

const OFFICIAL_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface PriceTier {
  inputMissPerMillion: number;
  inputHitPerMillion: number;
  outputPerMillion: number;
}

/** Official USD prices retrieved 2026-08-04. Bump the version when revising this table. */
const PRICE_TIERS: Readonly<Record<string, PriceTier>> = Object.freeze({
  "deepseek-v4-flash": { inputMissPerMillion: 0.14, inputHitPerMillion: 0.0028, outputPerMillion: 0.28 },
  "deepseek-v4-pro": { inputMissPerMillion: 0.435, inputHitPerMillion: 0.003625, outputPerMillion: 0.87 },
});

export function parseProviderUsage(value: unknown): ProviderUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    !isNonNegativeCount(value.prompt_tokens) ||
    !isNonNegativeCount(value.completion_tokens) ||
    !isNonNegativeCount(value.total_tokens)
  ) {
    return undefined;
  }

  const usage: ProviderUsage = {
    prompt_tokens: value.prompt_tokens,
    completion_tokens: value.completion_tokens,
    total_tokens: value.total_tokens,
  };
  copyOptionalCount(value, usage, "prompt_cache_hit_tokens");
  copyOptionalCount(value, usage, "prompt_cache_miss_tokens");

  const details = isRecord(value.completion_tokens_details) ? value.completion_tokens_details : undefined;
  if (details && isNonNegativeCount(details.reasoning_tokens)) {
    usage.reasoning_tokens = details.reasoning_tokens;
  }
  return usage;
}

export function isProviderUsage(value: unknown): value is ProviderUsage {
  return parseProviderUsage(value) !== undefined;
}

export function isOfficialDeepSeekEndpoint(baseUrl: string): boolean {
  return getApiOrigin(baseUrl) === getApiOrigin(OFFICIAL_DEEPSEEK_BASE_URL);
}

export function createUsageAggregate(officialEndpoint: boolean, model?: string): UsageAggregate {
  return {
    schemaVersion: USAGE_SCHEMA_VERSION,
    officialEndpoint,
    ...(model !== undefined ? { model } : {}),
    ...(officialEndpoint && resolvePriceTier(model) ? { priceCatalogVersion: PRICE_CATALOG_VERSION } : {}),
    count: 0,
    ...createEmptyPhaseUsage(),
    byPhase: {},
  };
}

/** Records one provider request exactly once. Undefined means usage was unavailable or malformed. */
export function recordUsage(aggregate: UsageAggregate, phase: UsagePhase, usage?: ProviderUsage): void {
  aggregate.count = safeAdd(aggregate.count, 1, aggregate);
  aggregate.requests = safeAdd(aggregate.requests, 1, aggregate);
  const phaseUsage = aggregate.byPhase[phase] ?? createEmptyPhaseUsage();
  phaseUsage.requests = safeAdd(phaseUsage.requests, 1, aggregate);
  aggregate.byPhase[phase] = phaseUsage;

  if (usage) {
    addReportedUsage(aggregate, usage, aggregate);
    addReportedUsage(phaseUsage, usage, aggregate);
  }
  refreshEstimatedCost(aggregate);
}

export function estimateUsageCost(usage: ProviderUsage | UsageAggregate, model: string | undefined): number | undefined {
  const tier = resolvePriceTier(model);
  if (!tier) {
    return undefined;
  }
  if ("saturated" in usage && usage.saturated) {return undefined;}

  const isAggregate = "count" in usage;
  const cacheHit = isAggregate ? usage.cacheHitTokens : usage.prompt_cache_hit_tokens;
  const cacheMiss = isAggregate ? usage.cacheMissTokens : usage.prompt_cache_miss_tokens;
  const output = isAggregate ? usage.outputTokens : usage.completion_tokens;
  if (cacheHit === undefined || cacheMiss === undefined || output === undefined) {
    return undefined;
  }
  if (isAggregate && (
    usage.count === 0 ||
    usage.reported !== usage.count ||
    usage.cacheHitReported !== usage.count ||
    usage.cacheMissReported !== usage.count
  )) {
    return undefined;
  }

  return roundCost(
    cacheMiss / 1_000_000 * tier.inputMissPerMillion +
    cacheHit / 1_000_000 * tier.inputHitPerMillion +
    output / 1_000_000 * tier.outputPerMillion,
  );
}

/** Combines persisted generation summaries into a conversation-level aggregate. */
export function aggregateUsageAggregates(values: readonly UsageAggregate[]): UsageAggregate | undefined {
  const observed = values.filter((value) => value.count > 0);
  if (observed.length === 0) {
    return undefined;
  }

  const models = new Set(observed.map((value) => value.model).filter((value): value is string => value !== undefined));
  const officialEndpoint = observed.every((value) => value.officialEndpoint);
  const aggregate = createUsageAggregate(officialEndpoint, models.size === 1 ? [...models][0] : undefined);
  for (const value of observed) {
    if (value.saturated) {aggregate.saturated = true;}
    mergePhaseUsage(aggregate, value, aggregate);
    aggregate.count = safeAdd(aggregate.count, value.count, aggregate);
    for (const phase of USAGE_PHASES) {
      const phaseUsage = value.byPhase[phase];
      if (!phaseUsage) {
        continue;
      }
      const target = aggregate.byPhase[phase] ?? createEmptyPhaseUsage();
      mergePhaseUsage(target, phaseUsage, aggregate);
      aggregate.byPhase[phase] = target;
    }
  }

  const catalogVersions = new Set(observed.map((value) => value.priceCatalogVersion));
  if (catalogVersions.size === 1 && catalogVersions.has(PRICE_CATALOG_VERSION)) {
    aggregate.priceCatalogVersion = PRICE_CATALOG_VERSION;
  } else {
    delete aggregate.priceCatalogVersion;
  }
  if (!aggregate.saturated && observed.every((value) => value.currency === "USD" && value.costUsd !== undefined) && aggregate.priceCatalogVersion !== undefined) {
    aggregate.currency = "USD";
    aggregate.costUsd = roundCost(observed.reduce((sum, value) => sum + (value.costUsd ?? 0), 0));
  } else {
    delete aggregate.currency;
    delete aggregate.costUsd;
  }
  return aggregate;
}

/** Validates a value read back from history; returns undefined when malformed or internally inconsistent. */
export function normalizeUsageAggregate(value: unknown): UsageAggregate | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== USAGE_SCHEMA_VERSION ||
    typeof value.officialEndpoint !== "boolean" ||
    !isNonNegativeCount(value.count) ||
    !isRecord(value.byPhase)
  ) {
    return undefined;
  }
  const totals = normalizePhaseUsage(value);
  if (!totals || totals.requests !== value.count) {
    return undefined;
  }
  if (value.model !== undefined && (typeof value.model !== "string" || value.model.length > 256)) {
    return undefined;
  }
  if (value.priceCatalogVersion !== undefined && value.priceCatalogVersion !== PRICE_CATALOG_VERSION) {
    return undefined;
  }
  if (value.currency !== undefined && value.currency !== "USD") {
    return undefined;
  }
  if (!isOptionalNonNegativeNumber(value.costUsd)) {
    return undefined;
  }

  const byPhase: UsageAggregate["byPhase"] = {};
  for (const [phase, phaseValue] of Object.entries(value.byPhase)) {
    if (!isUsagePhase(phase)) {
      return undefined;
    }
    const parsed = normalizePhaseUsage(phaseValue);
    if (!parsed || parsed.requests === 0) {
      return undefined;
    }
    byPhase[phase] = parsed;
  }
  if (!phaseTotalsMatch(totals, byPhase)) {
    return undefined;
  }

  const normalized: UsageAggregate = {
    schemaVersion: USAGE_SCHEMA_VERSION,
    officialEndpoint: value.officialEndpoint,
    ...(value.model !== undefined ? { model: value.model } : {}),
    ...(value.priceCatalogVersion !== undefined ? { priceCatalogVersion: PRICE_CATALOG_VERSION } : {}),
    ...(value.currency !== undefined ? { currency: "USD" } : {}),
    ...(value.costUsd !== undefined ? { costUsd: value.costUsd } : {}),
    count: value.count,
    ...totals,
    byPhase,
    ...(value.saturated === true ? { saturated: true } : {}),
  };
  if ((normalized.costUsd === undefined) !== (normalized.currency === undefined)) {
    return undefined;
  }
  return normalized;
}

export function isUsageAggregate(value: unknown): value is UsageAggregate {
  return normalizeUsageAggregate(value) !== undefined;
}

/** Redacted one-line summary suitable for diagnostics and release comparisons. */
export function formatUsageSummary(aggregate: UsageAggregate): string {
  const phases = USAGE_PHASES
    .filter((phase) => aggregate.byPhase[phase])
    .map((phase) => `${phase}:${formatPhaseUsage(aggregate.byPhase[phase] as PhaseUsage)}`)
    .join(" ");
  return [
    `usage requests=${aggregate.count}`,
    `reported=${aggregate.reported}`,
    `input=${formatCount(aggregate.inputTokens)}`,
    `output=${formatCount(aggregate.outputTokens)}`,
    `reasoning=${formatCount(aggregate.reasoningTokens)}`,
    `cacheHit=${formatCount(aggregate.cacheHitTokens)}`,
    `cacheMiss=${formatCount(aggregate.cacheMissTokens)}`,
    `total=${formatCount(aggregate.totalTokens)}`,
    aggregate.costUsd !== undefined ? `costUsd=${aggregate.costUsd.toFixed(6)}` : "cost=unavailable",
    aggregate.priceCatalogVersion !== undefined ? `priceCatalog=${aggregate.priceCatalogVersion}` : "priceCatalog=unavailable",
    phases ? `[${phases}]` : "",
  ].filter(Boolean).join(" ");
}

function createEmptyPhaseUsage(): PhaseUsage {
  return {
    requests: 0,
    reported: 0,
    reasoningReported: 0,
    cacheHitReported: 0,
    cacheMissReported: 0,
  };
}

function addReportedUsage(target: PhaseUsage, usage: ProviderUsage, aggregate: UsageAggregate): void {
  target.reported = safeAdd(target.reported, 1, aggregate);
  target.inputTokens = addOptional(target.inputTokens, usage.prompt_tokens, aggregate);
  target.outputTokens = addOptional(target.outputTokens, usage.completion_tokens, aggregate);
  target.totalTokens = addOptional(target.totalTokens, usage.total_tokens, aggregate);
  if (usage.reasoning_tokens !== undefined) {
    target.reasoningReported = safeAdd(target.reasoningReported, 1, aggregate);
    target.reasoningTokens = addOptional(target.reasoningTokens, usage.reasoning_tokens, aggregate);
  }
  if (usage.prompt_cache_hit_tokens !== undefined) {
    target.cacheHitReported = safeAdd(target.cacheHitReported, 1, aggregate);
    target.cacheHitTokens = addOptional(target.cacheHitTokens, usage.prompt_cache_hit_tokens, aggregate);
  }
  if (usage.prompt_cache_miss_tokens !== undefined) {
    target.cacheMissReported = safeAdd(target.cacheMissReported, 1, aggregate);
    target.cacheMissTokens = addOptional(target.cacheMissTokens, usage.prompt_cache_miss_tokens, aggregate);
  }
}

function mergePhaseUsage(target: PhaseUsage, source: PhaseUsage, aggregate?: UsageAggregate): void {
  target.requests = safeCountAdd(target.requests, source.requests, aggregate);
  target.reported = safeCountAdd(target.reported, source.reported, aggregate);
  target.reasoningReported = safeCountAdd(target.reasoningReported, source.reasoningReported, aggregate);
  target.cacheHitReported = safeCountAdd(target.cacheHitReported, source.cacheHitReported, aggregate);
  target.cacheMissReported = safeCountAdd(target.cacheMissReported, source.cacheMissReported, aggregate);
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "cacheHitTokens", "cacheMissTokens", "totalTokens"] as const) {
    if (source[key] !== undefined) {
      target[key] = addOptional(target[key], source[key], aggregate);
    }
  }
}

function refreshEstimatedCost(aggregate: UsageAggregate): void {
  const cost = aggregate.officialEndpoint ? estimateUsageCost(aggregate, aggregate.model) : undefined;
  if (cost === undefined) {
    delete aggregate.costUsd;
    delete aggregate.currency;
    return;
  }
  aggregate.priceCatalogVersion = PRICE_CATALOG_VERSION;
  aggregate.currency = "USD";
  aggregate.costUsd = cost;
}

function normalizePhaseUsage(value: unknown): PhaseUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  for (const key of ["requests", "reported", "reasoningReported", "cacheHitReported", "cacheMissReported"] as const) {
    if (!isNonNegativeCount(value[key])) {
      return undefined;
    }
  }
  const parsed: PhaseUsage = {
    requests: value.requests as number,
    reported: value.reported as number,
    reasoningReported: value.reasoningReported as number,
    cacheHitReported: value.cacheHitReported as number,
    cacheMissReported: value.cacheMissReported as number,
  };
  if (
    parsed.reported > parsed.requests ||
    parsed.reasoningReported > parsed.reported ||
    parsed.cacheHitReported > parsed.reported ||
    parsed.cacheMissReported > parsed.reported
  ) {
    return undefined;
  }
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "cacheHitTokens", "cacheMissTokens", "totalTokens"] as const) {
    if (value[key] !== undefined) {
      if (!isNonNegativeCount(value[key])) {
        return undefined;
      }
      parsed[key] = value[key];
    }
  }
  if (
    (parsed.reported === 0) !== (parsed.inputTokens === undefined) ||
    (parsed.reported === 0) !== (parsed.outputTokens === undefined) ||
    (parsed.reported === 0) !== (parsed.totalTokens === undefined) ||
    (parsed.reasoningReported === 0) !== (parsed.reasoningTokens === undefined) ||
    (parsed.cacheHitReported === 0) !== (parsed.cacheHitTokens === undefined) ||
    (parsed.cacheMissReported === 0) !== (parsed.cacheMissTokens === undefined)
  ) {
    return undefined;
  }
  return parsed;
}

function phaseTotalsMatch(totals: PhaseUsage, byPhase: UsageAggregate["byPhase"]): boolean {
  const sum = createEmptyPhaseUsage();
  for (const phase of USAGE_PHASES) {
    const value = byPhase[phase];
    if (value) {
      mergePhaseUsage(sum, value);
    }
  }
  return JSON.stringify(sum) === JSON.stringify(totals);
}

function formatPhaseUsage(usage: PhaseUsage): string {
  return `${usage.reported}/${usage.requests},in=${formatCount(usage.inputTokens)},out=${formatCount(usage.outputTokens)},hit=${formatCount(usage.cacheHitTokens)},miss=${formatCount(usage.cacheMissTokens)}`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "unavailable" : String(value);
}

function resolvePriceTier(model: string | undefined): PriceTier | undefined {
  return model ? PRICE_TIERS[model] : undefined;
}

function copyOptionalCount(source: Record<string, unknown>, target: ProviderUsage, key: "prompt_cache_hit_tokens" | "prompt_cache_miss_tokens"): void {
  if (isNonNegativeCount(source[key])) {
    target[key] = source[key];
  }
}

function addOptional(current: number | undefined, value: number, aggregate?: UsageAggregate): number {
  return safeCountAdd(current ?? 0, value, aggregate);
}

function safeCountAdd(left: number, right: number, aggregate?: UsageAggregate): number {
  const result = left + right;
  if (Number.isSafeInteger(result)) {return result;}
  if (aggregate) {aggregate.saturated = true;}
  return Number.MAX_SAFE_INTEGER;
}

function safeAdd(left: number, right: number, aggregate: UsageAggregate): number {
  const result = left + right;
  if (Number.isSafeInteger(result)) {return result;}
  aggregate.saturated = true;
  return Number.MAX_SAFE_INTEGER;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isOptionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isNonNegativeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isUsagePhase(value: unknown): value is UsagePhase {
  return USAGE_PHASES.includes(value as UsagePhase);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
