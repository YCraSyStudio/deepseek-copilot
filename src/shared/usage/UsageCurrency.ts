/**
 * Display currency for locally estimated usage costs. Persisted aggregates keep
 * USD as their canonical unit; DeepSeek publishes a USD and a CNY price table,
 * so the UI prices the other currency from that table instead of inventing an
 * exchange rate.
 */
export type UsageCurrency = "usd" | "cny";

export const DEFAULT_USAGE_CURRENCY: UsageCurrency = "usd";

export function isUsageCurrency(value: unknown): value is UsageCurrency {
  return value === "usd" || value === "cny";
}

export function normalizeUsageCurrency(value: unknown): UsageCurrency {
  return isUsageCurrency(value) ? value : DEFAULT_USAGE_CURRENCY;
}

/** ISO code used by the currency formatter and by the persisted aggregate. */
export function usageCurrencyCode(currency: UsageCurrency): "USD" | "CNY" {
  return currency === "cny" ? "CNY" : "USD";
}

export interface UsageCostFormatOptions {
  currency: UsageCurrency;
  /** BCP 47 locale used for separators and symbol placement. */
  locale: string;
  /** Text shown when the cost cannot be estimated. */
  unavailable: string;
  /** True when the value only covers the reported subset of the usage. */
  partial?: boolean;
}

/**
 * Formats an estimated cost with the locale's separators and the currency's
 * narrow symbol, keeping more precision for the sub-cent amounts a single
 * request usually costs.
 */
export function formatUsageCost(value: number | undefined, options: UsageCostFormatOptions): string {
  if (value === undefined) {
    return options.unavailable;
  }
  const formatted = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: usageCurrencyCode(options.currency),
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 6 : 2,
  }).format(value);
  return options.partial ? `≥ ${formatted}` : formatted;
}
