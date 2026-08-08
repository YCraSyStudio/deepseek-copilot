import type { ResolvedSearchEngine, SearchEngine } from "./Types";

export interface SearchLocale {
  language: string;
  region?: string;
  tag: string;
}

export interface SearchProvider {
  id: ResolvedSearchEngine;
  homeUrl: string;
  inputSelector: string;
  resultSelector: string;
  challengeUrls: readonly string[];
  assetUrls: readonly string[];
  buildUrl(query: string, locale: SearchLocale): string;
}

const PROVIDERS: Record<ResolvedSearchEngine, SearchProvider> = {
  bing: {
    id: "bing",
    homeUrl: "https://www.bing.com/",
    inputSelector: "textarea[name='q'],input[name='q']",
    resultSelector: "li.b_algo h2 a[href]",
    challengeUrls: ["https://www.bing.com/turing/captcha/challenge"],
    assetUrls: ["https://assets.msn.com/"],
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
    inputSelector: "textarea[name='q'],input[name='q']",
    resultSelector: "a[href] h3",
    challengeUrls: ["https://www.google.com/sorry/index"],
    assetUrls: ["https://www.gstatic.com/"],
    buildUrl: (query, locale) => {
      const url = new URL("https://www.google.com/search");
      url.searchParams.set("q", query);
      url.searchParams.set("hl", locale.language);
      if (locale.region) {url.searchParams.set("gl", locale.region);}
      return url.toString();
    },
  },
  baidu: {
    id: "baidu",
    homeUrl: "https://www.baidu.com/",
    inputSelector: "textarea[name='wd'],input[name='wd'],#kw",
    resultSelector: "#content_left h3 a[href],#content_left a[data-landurl]",
    challengeUrls: ["https://wappass.baidu.com/static/captcha"],
    assetUrls: ["https://pss.bdstatic.com/", "https://dss0.bdstatic.com/"],
    buildUrl: (query) => {
      const url = new URL("https://www.baidu.com/s");
      url.searchParams.set("wd", query);
      return url.toString();
    },
  },
};

export function getProvider(id: ResolvedSearchEngine): SearchProvider {return PROVIDERS[id];}

export function getSelectedSearchProvider(value: string | undefined): SearchProvider {
  return PROVIDERS[normalizeSearchEngine(value)];
}

export function getOrderedSearchProviders(value: string | undefined, _unused?: string): SearchProvider[] {
  return [getSelectedSearchProvider(value)];
}

export function normalizeSearchEngine(value: string | undefined): SearchEngine {
  const normalized = value?.trim().toLowerCase();
  return normalized === "google" || normalized === "baidu" || normalized === "bing" ? normalized : "bing";
}

export function resolveSearchLocale(
  languageArgument: string | undefined,
  regionArgument: string | undefined,
  systemLocale: string | undefined,
  vscodeLanguage: string | undefined,
): SearchLocale {
  const base = parseLocale(languageArgument ?? systemLocale ?? vscodeLanguage ?? "en");
  const region = regionArgument ?? base.region;
  return { language: base.language, region, tag: region ? `${base.language}-${region}` : base.language };
}

export function addDomainConstraint(query: string, domains: readonly string[]): string {
  if (domains.length === 0) {return query;}
  if (domains.length === 1) {return `${query} site:${domains[0]}`;}
  return `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

function parseLocale(locale: string): { language: string; region?: string } {
  const parts = locale.replace(/_/g, "-").split("-").filter(Boolean);
  const language = /^[a-z]{2,3}$/i.test(parts[0] ?? "") ? parts[0]!.toLowerCase() : "en";
  const region = parts.find((part, index) => index > 0 && /^(?:[a-z]{2}|\d{3})$/i.test(part))?.toUpperCase();
  return { language, region };
}
