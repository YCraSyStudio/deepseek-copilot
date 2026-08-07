import type { ResolvedSearchEngine, SearchEngine } from "./Types";

export interface SearchLocale {
  language: string;
  region?: string;
  tag: string;
}

export interface SearchProvider {
  id: ResolvedSearchEngine;
  buildUrl(query: string, locale: SearchLocale): string;
  homeUrl: string;
}

const PROVIDERS: Record<ResolvedSearchEngine, SearchProvider> = {
  duckduckgo: {
    id: "duckduckgo",
    homeUrl: "https://duckduckgo.com/",
    buildUrl: (query, locale) => {
      const url = new URL("https://duckduckgo.com/");
      url.searchParams.set("q", query);
      url.searchParams.set("kl", `${(locale.region ?? "US").toLowerCase()}-${locale.language}`);
      return url.toString();
    },
  },
  bing: {
    id: "bing",
    homeUrl: "https://www.bing.com/",
    buildUrl: (query, locale) => {
      const url = new URL("https://www.bing.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("setlang", locale.language);
      if (locale.region) {url.searchParams.set("cc", locale.region);}
      return url.toString();
    },
  },
  google: {
    id: "google",
    homeUrl: "https://www.google.com/",
    buildUrl: (query, locale) => {
      const url = new URL("https://www.google.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("hl", locale.language);
      if (locale.region) {url.searchParams.set("gl", locale.region);}
      return url.toString();
    },
  },
  yahoo: {
    id: "yahoo",
    homeUrl: "https://search.yahoo.com/",
    buildUrl: (query, locale) => {
      const url = new URL("https://search.yahoo.com/search");
      url.searchParams.set("p", query);
      url.searchParams.set("vl", locale.tag);
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

export function resolveSearchLocale(
  languageArgument: string | undefined,
  regionArgument: string | undefined,
  configuredLocale: string | undefined,
  systemLocale: string | undefined,
  vscodeLanguage: string | undefined,
): SearchLocale {
  const configured = configuredLocale?.trim().toLowerCase() === "auto" ? undefined : configuredLocale;
  const base = parseLocale(languageArgument ?? configured ?? systemLocale ?? vscodeLanguage ?? "en");
  const language = base.language;
  const region = regionArgument ?? base.region;
  return {
    language,
    region,
    tag: region ? `${language}-${region}` : language,
  };
}

export function addDomainConstraint(query: string, domains: readonly string[]): string {
  if (domains.length === 0) {return query;}
  if (domains.length === 1) {return `${query} site:${domains[0]}`;}
  return `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

export function getProvider(id: ResolvedSearchEngine): SearchProvider {
  return PROVIDERS[id];
}

function parseLocale(locale: string): { language: string; region?: string } {
  const parts = locale.replace(/_/g, "-").split("-").filter(Boolean);
  const language = /^[a-z]{2,3}$/i.test(parts[0] ?? "") ? parts[0]!.toLowerCase() : "en";
  const regionPart = parts.find((part, index) => index > 0 && /^(?:[a-z]{2}|\d{3})$/i.test(part));
  return { language, region: regionPart?.toUpperCase() };
}
