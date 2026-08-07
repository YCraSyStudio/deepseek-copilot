import type {
  InternalWebSearchResultItem,
  ResolvedSearchEngine,
  WebSearchResultItem,
} from "./Types";
import { validatePublicHttpsUrl } from "./Validation";

const MAX_TITLE_CHARS = 160;
const MAX_SNIPPET_CHARS = 280;
const SEARCH_FAILURE_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /access denied/i,
  /verify (?:that )?you are human/i,
  /this site can(?:not|'t) be reached/i,
  /ERR_[A-Z_]+/,
  /network error/i,
  /enable javascript and cookies/i,
];
const TRACKING_PARAMETERS = /^(?:utm_.+|gclid|fbclid|msclkid|mc_[ce]id|ref_src|WT\.mc_id)$/i;
const NOISE_TITLE = /^(?:back to .+ search|all|images?|videos?|news|maps?|shopping|settings|sign in|next|previous|more results|search|explore this image|see results only from .+|feedback|privacy(?: & cookies)?|manage cookies|terms of use)$/i;
const NOISE_CONTENT = /(?:\bsponsored\b|\badvertisement\b|\bpromoted\b|cookie preferences|account rewards and preferences)/i;

interface CandidateResult {
  title: string;
  rawUrls: string[];
  ref?: string;
  snippet?: string;
  order: number;
  noisy?: boolean;
}

export interface SearchExtraction {
  results: InternalWebSearchResultItem[];
  candidates: number;
  discarded: number;
  urlCoverage: number;
}

export function extractSearchResults(
  snapshot: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
  maxResults = 6,
): WebSearchResultItem[] {
  return extractSearchResultsDetailed(snapshot, searchUrl, provider, maxResults).results;
}

export function extractSearchResultsDetailed(
  snapshot: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
  maxResults = 6,
): SearchExtraction {
  const semantic = extractSemanticLinks(snapshot);
  const semanticRawUrls = new Set(semantic.flatMap((candidate) => candidate.rawUrls.map(normalizeRawUrlKey)));
  const candidates = [
    ...semantic,
    ...extractMarkdownLinks(snapshot, semantic.length),
    ...extractRawUrls(snapshot, semantic.length + 10_000, semanticRawUrls),
  ];
  const results: InternalWebSearchResultItem[] = [];
  const seen = new Set<string>();
  let discarded = 0;

  for (const candidate of candidates.sort((a, b) => a.order - b.order)) {
    const url = candidate.rawUrls
      .map((rawUrl) => normalizeSearchResultUrl(rawUrl, searchUrl, provider))
      .find((value): value is string => value !== undefined);
    const title = cleanText(candidate.title).slice(0, MAX_TITLE_CHARS);
    const snippet = candidate.snippet ? cleanText(candidate.snippet).slice(0, MAX_SNIPPET_CHARS) : undefined;
    if (!url || !title || candidate.noisy || isSearchNavigationTitle(title) || isNoiseRawUrl(title, url) ||
      NOISE_CONTENT.test(`${title} ${snippet ?? ""}`)) {
      discarded += 1;
      continue;
    }
    const canonical = canonicalUrlKey(url);
    if (seen.has(canonical)) {
      discarded += 1;
      continue;
    }
    seen.add(canonical);
    results.push({
      id: `result_${results.length + 1}`,
      title,
      url,
      domain: new URL(url).hostname,
      snippet: snippet && snippet !== title ? snippet : undefined,
      ref: candidate.ref,
    });
    if (results.length >= maxResults) {break;}
  }

  return {
    results,
    candidates: candidates.length,
    discarded,
    urlCoverage: results.length === 0 ? 0 : results.filter((result) => result.url.startsWith("https://")).length / results.length,
  };
}

export function isSearchPageBlocked(content: string): boolean {
  return SEARCH_FAILURE_PATTERNS.some((pattern) => pattern.test(content));
}

export function findSearchBoxRef(content: string): string | undefined {
  const match = /(?:^|\n)\s*-?\s*searchbox(?:\s+"[^"]*")?\s+\[ref=([^\]]+)\]/i.exec(content);
  return match?.[1];
}

export function normalizeSearchResultUrl(
  rawUrl: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
): string | undefined {
  try {
    let url = new URL(decodeHtmlEntities(stripQuotes(rawUrl)), searchUrl);
    url = unwrapSearchRedirect(url, provider) ?? url;
    if (url.protocol !== "https:" || isProviderHost(url.hostname, provider) || isAnySearchProviderHost(url.hostname)) {return undefined;}
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(parameter)) {url.searchParams.delete(parameter);}
    }
    const validated = validatePublicHttpsUrl(url.toString());
    return validated.length <= 2_048 ? validated : undefined;
  } catch {
    return undefined;
  }
}

function extractSemanticLinks(snapshot: string): CandidateResult[] {
  const lines = snapshot.split(/\r?\n/);
  const results: CandidateResult[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const link = /(?:^|\s)-?\s*link\s+"((?:\\"|[^"])*)"(?:[^\n]*?\[ref=([^\]]+)\])?/i.exec(line);
    if (!link) {continue;}
    const indent = leadingWhitespace(line);
    const block: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nested = lines[cursor] ?? "";
      if (nested.trim() && leadingWhitespace(nested) <= indent) {break;}
      block.push(nested);
    }
    const rawUrls = extractUrlsFromBlock(block);
    const snippet = block
      .filter((nested) => !/(?:\/url|url|href):/i.test(nested))
      .map(cleanSnapshotLine)
      .filter(Boolean)
      .slice(0, 8)
      .join(" ");
    results.push({
      title: link[1]?.replace(/\\"/g, "\"") ?? "",
      ref: link[2],
      rawUrls,
      snippet,
      order: index,
      noisy: NOISE_CONTENT.test(block.join(" ")),
    });
  }
  return results;
}

function extractMarkdownLinks(snapshot: string, orderOffset: number): CandidateResult[] {
  const results: CandidateResult[] = [];
  const pattern = /\[([^\]\n]{1,240})\]\((https?:\/\/[^)\s]+)\)/g;
  let index = 0;
  for (const match of snapshot.matchAll(pattern)) {
    results.push({ title: match[1] ?? "", rawUrls: [match[2] ?? ""], order: orderOffset + index });
    index += 1;
  }
  return results;
}

function extractRawUrls(snapshot: string, orderOffset: number, excluded: ReadonlySet<string>): CandidateResult[] {
  const results: CandidateResult[] = [];
  const pattern = /https:\/\/[^\s<>{}\[\]"']+/g;
  let index = 0;
  for (const match of snapshot.matchAll(pattern)) {
    const rawUrl = match[0].replace(/[),.;:!?]+$/, "");
    if (excluded.has(normalizeRawUrlKey(rawUrl))) {continue;}
    results.push({ title: rawUrl, rawUrls: [rawUrl], order: orderOffset + index });
    index += 1;
  }
  return results;
}

function normalizeRawUrlKey(value: string): string {
  return decodeHtmlEntities(stripQuotes(value)).replace(/[),.;:!?]+$/, "");
}

function extractUrlsFromBlock(lines: readonly string[]): string[] {
  const urls: string[] = [];
  for (const line of lines) {
    const explicit = /(?:\/url|url|href):\s*["']?([^"'\s]+)["']?/i.exec(line)?.[1];
    if (explicit) {urls.push(explicit);}
    for (const match of line.matchAll(/https:\/\/[^\s<>{}\[\]"']+/g)) {
      urls.push(match[0].replace(/[),.;:!?]+$/, ""));
    }
  }
  return [...new Set(urls)];
}

function unwrapSearchRedirect(url: URL, provider: ResolvedSearchEngine): URL | undefined {
  let target: string | null | undefined = null;
  if (provider === "google" && url.pathname === "/url") {
    target = url.searchParams.get("q") ?? url.searchParams.get("url");
  } else if (provider === "duckduckgo" && url.pathname.startsWith("/l/")) {
    target = url.searchParams.get("uddg");
  } else if (provider === "yahoo") {
    const match = /\/RU=([^/]+)\/RK=/i.exec(url.pathname);
    target = match?.[1] ? safeDecodeURIComponent(match[1]) : null;
  } else if (provider === "bing" && url.pathname.toLowerCase().startsWith("/ck/a")) {
    target = decodeBingRedirect(url.searchParams.get("u"));
  }
  if (!target) {return undefined;}
  try {return new URL(target);} catch {return undefined;}
}

function decodeBingRedirect(value: string | null): string | undefined {
  if (!value) {return undefined;}
  const decoded = safeDecodeURIComponent(value);
  if (/^https:\/\//i.test(decoded)) {return decoded;}
  const payload = decoded.startsWith("a1") ? decoded.slice(2) : decoded;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const target = Buffer.from(padded, "base64").toString("utf8");
    return /^https:\/\//i.test(target) ? target : undefined;
  } catch {
    return undefined;
  }
}

function isProviderHost(hostname: string, provider: ResolvedSearchEngine): boolean {
  const host = hostname.toLowerCase();
  if (provider === "bing") {return host === "bing.com" || host.endsWith(".bing.com");}
  if (provider === "google") {return host === "google.com" || host.includes(".google.") || host.startsWith("google.");}
  if (provider === "duckduckgo") {return host === "duckduckgo.com" || host.endsWith(".duckduckgo.com");}
  return host === "yahoo.com" || host.endsWith(".yahoo.com");
}

function isAnySearchProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "bing.com" || host.endsWith(".bing.com") ||
    host === "duckduckgo.com" || host.endsWith(".duckduckgo.com") ||
    host === "google.com" || host.includes(".google.") || host.startsWith("google.") ||
    host === "yahoo.com" || host.endsWith(".yahoo.com");
}

function canonicalUrlKey(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") {url.pathname = url.pathname.replace(/\/+$/, "");}
  url.searchParams.sort();
  return url.toString();
}

function isSearchNavigationTitle(title: string): boolean {
  return NOISE_TITLE.test(title) || title.length < 2;
}

function isNoiseRawUrl(title: string, url: string): boolean {
  if (!/^https:\/\//i.test(title)) {return false;}
  return /(?:privacy|cookie|terms|preferences|account|login|signin|settings|\/fwlink\/)/i.test(url);
}

function cleanSnapshotLine(line: string): string {
  const withoutPrefix = line
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\s*\[(?:ref|level)=[^\]]+\]/gi, "")
    .replace(/\s*\[cursor=pointer\]/gi, "")
    .trim();
  const quoted = /^(?:text|paragraph|heading|generic|listitem)(?:\s+"((?:\\"|[^"])*)"[^:]*|:\s*(.+))$/i.exec(withoutPrefix);
  const value = quoted?.[1] ?? quoted?.[2] ?? withoutPrefix;
  if (/^(?:generic|list|listitem|paragraph|heading|img|button|superscript|tooltip)(?:\s+\[|:)?$/i.test(value)) {
    return "";
  }
  return /^https:\/\//i.test(value) ? "" : cleanText(value);
}

function cleanText(value: string): string {
  return decodeHtmlEntities(value).replace(/\\"/g, "\"").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x3D;/gi, "=")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function safeDecodeURIComponent(value: string): string {
  try {return decodeURIComponent(value);} catch {return value;}
}

function leadingWhitespace(value: string): number {
  return /^\s*/.exec(value)?.[0].length ?? 0;
}
