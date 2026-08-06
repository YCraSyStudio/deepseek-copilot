import type { ResolvedSearchEngine, SearchEngine } from "./Types";

export interface SearchProvider {
  id: ResolvedSearchEngine;
  buildUrl(query: string, locale: string): string;
}

const PROVIDERS: Record<ResolvedSearchEngine, SearchProvider> = {
  duckduckgo: {
    id: "duckduckgo",
    buildUrl: (query, locale) => {
      const url = new URL("https://duckduckgo.com/");
      url.searchParams.set("q", query);
      url.searchParams.set("kl", toDuckDuckGoLocale(locale));
      return url.toString();
    },
  },
  bing: {
    id: "bing",
    buildUrl: (query, locale) => {
      const { language, region } = parseLocale(locale);
      const url = new URL("https://www.bing.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("setlang", language);
      if (region) {url.searchParams.set("cc", region);}
      return url.toString();
    },
  },
  google: {
    id: "google",
    buildUrl: (query, locale) => {
      const { language, region } = parseLocale(locale);
      const url = new URL("https://www.google.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("hl", language);
      if (region) {url.searchParams.set("gl", region);}
      return url.toString();
    },
  },
  yahoo: {
    id: "yahoo",
    buildUrl: (query) => {
      const url = new URL("https://search.yahoo.com/search");
      url.searchParams.set("p", query);
      return url.toString();
    },
  },
};

const DEFAULT_ORDER: ResolvedSearchEngine[] = ["duckduckgo", "bing", "google", "yahoo"];

export function getOrderedSearchProviders(
  preference: string | undefined,
  nativePreference: string | undefined,
): SearchProvider[] {
  const configured = normalizeSearchEngine(preference);
  const native = normalizeSearchEngine(nativePreference);
  const preferred = configured !== "auto" ? configured : native !== "auto" ? native : undefined;
  const order = preferred
    ? [preferred, ...DEFAULT_ORDER.filter((engine) => engine !== preferred)]
    : DEFAULT_ORDER;
  return order.map((engine) => PROVIDERS[engine]);
}

export function normalizeSearchEngine(value: string | undefined): SearchEngine {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "bing") {return "bing";}
  if (normalized === "duckduckgo" || normalized === "ddg") {return "duckduckgo";}
  if (normalized === "google") {return "google";}
  if (normalized === "yahoo") {return "yahoo";}
  return "auto";
}

function parseLocale(locale: string): { language: string; region?: string } {
  const parts = locale.replace("_", "-").split("-").filter(Boolean);
  const language = /^[a-z]{2,3}$/i.test(parts[0] ?? "") ? parts[0]!.toLowerCase() : "en";
  const regionPart = parts.find((part, index) => index > 0 && /^[a-z]{2}$/i.test(part));
  return { language, region: regionPart?.toUpperCase() };
}

function toDuckDuckGoLocale(locale: string): string {
  const { language, region } = parseLocale(locale);
  return `${(region ?? "US").toLowerCase()}-${language}`;
}
