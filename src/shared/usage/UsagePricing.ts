import { getApiOrigin } from "@/shared/security/ApiOrigin";
import type { UsageCurrency } from "./UsageCurrency";
import { PRICE_CATALOG_VERSION, type ProviderUsage, type UsageAggregate } from "./UsageModels";

const OFFICIAL_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

interface PriceRate {
  inputMissPerMillion: number;
  inputHitPerMillion: number;
  outputPerMillion: number;
}

interface PriceTier {
  peak: PriceRate;
  offPeak: PriceRate;
}

/** Official DeepSeek-V4.1-Flash off-peak rates in USD per 1M tokens. */
const FLASH_OFF_PEAK_RATE_USD: PriceRate = Object.freeze({
  inputMissPerMillion: 0.15,
  inputHitPerMillion: 0.003,
  outputPerMillion: 0.6,
});

/** Official DeepSeek-V4.1-Flash off-peak rates in CNY per 1M tokens. */
const FLASH_OFF_PEAK_RATE_CNY: PriceRate = Object.freeze({
  inputMissPerMillion: 1,
  inputHitPerMillion: 0.02,
  outputPerMillion: 4,
});

const OFF_PEAK_RATES: Readonly<Record<UsageCurrency, PriceRate>> = Object.freeze({
  usd: FLASH_OFF_PEAK_RATE_USD,
  cny: FLASH_OFF_PEAK_RATE_CNY,
});

/**
 * Official prices retrieved 2026-09-10. DeepSeek publishes a USD and a CNY
 * table instead of an exchange rate, so each display currency is priced from
 * its own documented numbers. DeepSeek bills weekdays 01:00-04:00 and
 * 06:00-10:00 UTC (09:00-12:00 and 14:00-18:00 Beijing time) at twice the
 * off-peak rate.
 */
const FLASH_TIERS: Readonly<Record<UsageCurrency, PriceTier>> = Object.freeze(createTiers(OFF_PEAK_RATES));

/**
 * Models whose rates this catalog publishes. The shared layer cannot import the
 * contract model registry, so the priced model id lives beside its rates.
 */
const PRICED_MODEL_IDS: ReadonlySet<string> = new Set(["deepseek-flash"]);

export function isOfficialDeepSeekEndpoint(baseUrl: string): boolean {
  return getApiOrigin(baseUrl) === getApiOrigin(OFFICIAL_DEEPSEEK_BASE_URL);
}

export function supportsUsagePricing(model: string | undefined): boolean {
  return resolvePriceTier(model, "usd") !== undefined;
}

export function estimateUsageCost(
  usage: ProviderUsage | UsageAggregate,
  model: string | undefined,
  at?: Date,
  currency: UsageCurrency = "usd",
): number | undefined {
  const instant = resolvePricedInstant(usage, at);
  const tier = resolvePriceTier(model, currency);
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

  return calculateUsageCost(selectRate(tier, instant), cacheHit, cacheMiss, output);
}

/**
 * Prices the reported subset of an aggregate. When requests are missing usage,
 * this is a lower bound for the conversation rather than its exact total.
 */
export function estimateReportedUsageCost(
  usage: UsageAggregate,
  at?: Date,
  currency: UsageCurrency = "usd",
): number | undefined {
  if (
    !usage.officialEndpoint ||
    usage.saturated ||
    // A stored estimate is only comparable inside its own price catalog; older
    // versions keep the value they were billed with instead of being recomputed.
    usage.priceCatalogVersion !== PRICE_CATALOG_VERSION ||
    usage.reported === 0 ||
    usage.cacheHitReported !== usage.reported ||
    usage.cacheMissReported !== usage.reported ||
    usage.cacheHitTokens === undefined ||
    usage.cacheMissTokens === undefined ||
    usage.outputTokens === undefined
  ) {
    return undefined;
  }
  const instant = resolvePricedInstant(usage, at);
  const tier = resolvePriceTier(usage.model, currency);
  return tier
    ? calculateUsageCost(selectRate(tier, instant), usage.cacheHitTokens, usage.cacheMissTokens, usage.outputTokens)
    : undefined;
}

/**
 * Prices an aggregate for display in the requested currency. USD reuses the
 * stored estimate; every other currency reprices the reported tokens from
 * DeepSeek's own rate table for that currency.
 */
export function estimateAggregateCost(
  usage: UsageAggregate,
  currency: UsageCurrency = "usd",
  at?: Date,
): number | undefined {
  return currency === "usd"
    ? usage.costUsd ?? estimateReportedUsageCost(usage, at)
    : estimateReportedUsageCost(usage, at, currency);
}

/** Persisted aggregates always store their estimate in USD. */
export function refreshUsageCost(aggregate: UsageAggregate, at?: Date): void {
  const instant = resolvePricedInstant(aggregate, at);
  const cost = aggregate.officialEndpoint ? estimateUsageCost(aggregate, aggregate.model, instant) : undefined;
  if (cost === undefined) {
    delete aggregate.costUsd;
    delete aggregate.currency;
    return;
  }
  aggregate.priceCatalogVersion = PRICE_CATALOG_VERSION;
  aggregate.pricedAt = instant.toISOString();
  aggregate.currency = "USD";
  aggregate.costUsd = cost;
}

/**
 * Anchors pricing to the request instant instead of the moment a panel is
 * reopened: outside that window a weekday peak aggregate would otherwise be
 * recomputed at double its billed rate.
 */
function resolvePricedInstant(usage: ProviderUsage | UsageAggregate, at?: Date): Date {
  if (at) {return at;}
  const stored = "pricedAt" in usage && usage.pricedAt ? new Date(usage.pricedAt) : undefined;
  return stored && !Number.isNaN(stored.getTime()) ? stored : new Date();
}

export function roundUsageCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday. */
function isPeakPricingHour(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) {return false;}
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function createTiers(rates: Readonly<Record<UsageCurrency, PriceRate>>): Readonly<Record<UsageCurrency, PriceTier>> {
  return {
    usd: createPriceTier(rates.usd),
    cny: createPriceTier(rates.cny),
  };
}

function createPriceTier(offPeak: PriceRate): PriceTier {
  return {
    offPeak,
    peak: {
      inputMissPerMillion: offPeak.inputMissPerMillion * 2,
      inputHitPerMillion: offPeak.inputHitPerMillion * 2,
      outputPerMillion: offPeak.outputPerMillion * 2,
    },
  };
}

/** Only a model with a published table is priced; anything else yields no estimate. */
function resolvePriceTier(model: string | undefined, currency: UsageCurrency): PriceTier | undefined {
  return model && PRICED_MODEL_IDS.has(model) ? FLASH_TIERS[currency] : undefined;
}

function selectRate(tier: PriceTier, at: Date): PriceRate {
  return isPeakPricingHour(at) ? tier.peak : tier.offPeak;
}

function calculateUsageCost(rate: PriceRate, cacheHit: number, cacheMiss: number, output: number): number {
  return roundUsageCost(
    cacheMiss / 1_000_000 * rate.inputMissPerMillion +
    cacheHit / 1_000_000 * rate.inputHitPerMillion +
    output / 1_000_000 * rate.outputPerMillion,
  );
}
