/**
 * Privacy-safe provider usage. Only aggregate counts, phase labels, model IDs,
 * and a price-catalog version cross the persistence and webview boundaries.
 */
export const USAGE_SCHEMA_VERSION = 1;
/**
 * Version of the price table used for newly recorded usage. Bump it whenever a
 * rate changes so a stored estimate is never mistaken for a current one.
 * Version 2 (2026-09-10) introduced DeepSeek-V4.1-Flash prices with weekday
 * peak/off-peak tiering; version 1 aggregates are still readable and keep the
 * estimate they were billed with instead of being recomputed at newer rates.
 */
export const PRICE_CATALOG_VERSION = 2;
export const READABLE_PRICE_CATALOG_VERSIONS: readonly number[] = [1, PRICE_CATALOG_VERSION];

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
  | "completion_review"
  | "progress_review"
  | "security_review"
  | "context_summary"
  | "file_compaction"
  /** Retained so aggregates persisted by releases that delegated images to a separate vision model still validate. */
  | "vision_analysis";

export const USAGE_PHASES: readonly UsagePhase[] = [
  "primary",
  "tool_round",
  "completion_review",
  "progress_review",
  "security_review",
  "context_summary",
  "file_compaction",
  "vision_analysis",
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
  priceCatalogVersion?: number;
  /**
   * UTC instant of the first priced request in this aggregate. DeepSeek bills
   * weekdays 01:00-04:00 and 06:00-10:00 UTC at twice the off-peak rate, so the
   * tier must follow the request and not the moment the panel is reopened.
   */
  pricedAt?: string;
  currency?: "USD";
  /** Present only when every request has enough authoritative usage to price it. */
  costUsd?: number;
  /** Backwards-compatible request count used by persisted/webview consumers. */
  count: number;
  byPhase: Partial<Record<UsagePhase, PhaseUsage>>;
  /** Set when a persisted numeric counter reached JavaScript's safe-integer ceiling. */
  saturated?: true;
}
