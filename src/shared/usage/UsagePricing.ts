import { getApiOrigin } from "@/shared/security/ApiOrigin";
import { PRICE_CATALOG_VERSION, type ProviderUsage, type UsageAggregate } from "./UsageModels";

const OFFICIAL_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface PriceTier {
  inputMissPerMillion: number;
  inputHitPerMillion: number;
  outputPerMillion: number;
}

/** Official USD prices retrieved 2026-08-04. Bump the version when revising this table. */
const PRICE_TIERS: Readonly<Record<string, PriceTier>> = Object.freeze({
  "deepseek-v4-flash-vision-exp": { inputMissPerMillion: 0.14, inputHitPerMillion: 0.0028, outputPerMillion: 0.28 },
  "deepseek-v4-flash": { inputMissPerMillion: 0.14, inputHitPerMillion: 0.0028, outputPerMillion: 0.28 },
  "deepseek-v4-pro": { inputMissPerMillion: 0.435, inputHitPerMillion: 0.003625, outputPerMillion: 0.87 },
});

export function isOfficialDeepSeekEndpoint(baseUrl: string): boolean {
  return getApiOrigin(baseUrl) === getApiOrigin(OFFICIAL_DEEPSEEK_BASE_URL);
}

export function supportsUsagePricing(model: string | undefined): boolean {
  return resolvePriceTier(model) !== undefined;
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

  return calculateUsageCost(tier, cacheHit, cacheMiss, output);
}

/**
 * Prices the reported subset of an aggregate. When requests are missing usage,
 * this is a lower bound for the conversation rather than its exact total.
 */
export function estimateReportedUsageCost(usage: UsageAggregate): number | undefined {
  if (
    !usage.officialEndpoint ||
    usage.saturated ||
    usage.reported === 0 ||
    usage.cacheHitReported !== usage.reported ||
    usage.cacheMissReported !== usage.reported ||
    usage.cacheHitTokens === undefined ||
    usage.cacheMissTokens === undefined ||
    usage.outputTokens === undefined
  ) {
    return undefined;
  }
  const tier = resolvePriceTier(usage.model);
  return tier
    ? calculateUsageCost(tier, usage.cacheHitTokens, usage.cacheMissTokens, usage.outputTokens)
    : undefined;
}

export function refreshUsageCost(aggregate: UsageAggregate): void {
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

export function roundUsageCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolvePriceTier(model: string | undefined): PriceTier | undefined {
  return model ? PRICE_TIERS[model] : undefined;
}

function calculateUsageCost(tier: PriceTier, cacheHit: number, cacheMiss: number, output: number): number {
  return roundUsageCost(
    cacheMiss / 1_000_000 * tier.inputMissPerMillion +
    cacheHit / 1_000_000 * tier.inputHitPerMillion +
    output / 1_000_000 * tier.outputPerMillion,
  );
}
