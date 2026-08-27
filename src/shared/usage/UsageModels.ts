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
  | "completion_review"
  | "progress_review"
  | "security_review"
  | "context_summary"
  | "file_compaction"
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
