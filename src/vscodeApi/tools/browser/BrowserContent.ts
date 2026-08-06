import type { ResolvedSearchEngine, WebSearchResultItem } from "./Types";

const MAX_RESULTS = 10;
const MAX_TITLE_CHARS = 240;
const MAX_SNIPPET_CHARS = 360;
const MAX_FALLBACK_CONTENT_CHARS = 12 * 1024;
const SEARCH_FAILURE_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /access denied/i,
  /verify (?:that )?you are human/i,
  /this site can(?:not|'t) be reached/i,
  /ERR_[A-Z_]+/,
  /network error/i,
];

interface CandidateResult {
  title: string;
  rawUrl?: string;
  ref?: string;
  snippet?: string;
}

export function extractSearchResults(
  snapshot: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
): WebSearchResultItem[] {
  const candidates = [
    ...extractSemanticLinks(snapshot),
    ...extractMarkdownLinks(snapshot),
    ...extractRawUrls(snapshot),
  ];
  const results: WebSearchResultItem[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const url = candidate.rawUrl
      ? normalizeSearchResultUrl(candidate.rawUrl, searchUrl, provider)
      : undefined;
    if (!url && !candidate.ref) {continue;}
    const title = cleanText(candidate.title).slice(0, MAX_TITLE_CHARS);
    if (!title || isSearchNavigationTitle(title)) {continue;}
    const dedupeKey = url ?? `${candidate.ref}:${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) {continue;}
    seen.add(dedupeKey);

    results.push({
      id: `result_${results.length + 1}`,
      title,
      url,
      domain: url ? new URL(url).hostname : undefined,
      snippet: candidate.snippet ? cleanText(candidate.snippet).slice(0, MAX_SNIPPET_CHARS) : undefined,
      ref: candidate.ref,
    });
    if (results.length >= MAX_RESULTS) {break;}
  }

  return results;
}

export function isSearchPageBlocked(content: string): boolean {
  return SEARCH_FAILURE_PATTERNS.some((pattern) => pattern.test(content));
}

export function compactBrowserContent(content: string, maxChars = MAX_FALLBACK_CONTENT_CHARS): {
  content: string;
  truncated: boolean;
} {
  const normalized = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line.trim() !== "" || lines[index - 1]?.trim() !== "")
    .join("\n")
    .trim();
  if (normalized.length <= maxChars) {
    return { content: normalized, truncated: false };
  }
  return {
    content: `${normalized.slice(0, maxChars)}\n[Browser content truncated]`,
    truncated: true,
  };
}

function extractSemanticLinks(snapshot: string): CandidateResult[] {
  const lines = snapshot.split(/\r?\n/);
  const results: CandidateResult[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const link = /(?:^|\s)-?\s*link\s+"([^"]+)"(?:\s+\[ref=([^\]]+)\])?/i.exec(line);
    if (!link) {continue;}
    let rawUrl: string | undefined;
    const snippetLines: string[] = [];
    for (let offset = 1; offset <= 8 && index + offset < lines.length; offset += 1) {
      const nested = lines[index + offset] ?? "";
      if (/(?:^|\s)-?\s*link\s+"/i.test(nested)) {break;}
      const urlMatch = /(?:\/url|url|href):\s*["']?([^"'\s]+)["']?\s*$/i.exec(nested);
      if (urlMatch) {
        rawUrl = urlMatch[1];
        continue;
      }
      const cleaned = cleanSnapshotLine(nested);
      if (cleaned && !/^\[ref=/.test(cleaned)) {snippetLines.push(cleaned);}
    }
    results.push({
      title: link[1] ?? "",
      ref: link[2],
      rawUrl,
      snippet: snippetLines.join(" "),
    });
  }
  return results;
}

function extractMarkdownLinks(snapshot: string): CandidateResult[] {
  const results: CandidateResult[] = [];
  const pattern = /\[([^\]\n]{1,240})\]\((https?:\/\/[^)\s]+)\)/g;
  for (const match of snapshot.matchAll(pattern)) {
    results.push({ title: match[1] ?? "", rawUrl: match[2] });
  }
  return results;
}

function extractRawUrls(snapshot: string): CandidateResult[] {
  const results: CandidateResult[] = [];
  const pattern = /https:\/\/[^\s<>{}\[\]"']+/g;
  for (const match of snapshot.matchAll(pattern)) {
    const rawUrl = match[0].replace(/[),.;:!?]+$/, "");
    results.push({ title: rawUrl, rawUrl });
  }
  return results;
}

function normalizeSearchResultUrl(
  rawUrl: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
): string | undefined {
  try {
    let url = new URL(decodeHtmlEntities(rawUrl), searchUrl);
    url = unwrapSearchRedirect(url, provider) ?? url;
    if (url.protocol !== "https:" || isProviderHost(url.hostname, provider)) {return undefined;}
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function unwrapSearchRedirect(url: URL, provider: ResolvedSearchEngine): URL | undefined {
  let target: string | null = null;
  if (provider === "google" && url.pathname === "/url") {
    target = url.searchParams.get("q") ?? url.searchParams.get("url");
  } else if (provider === "duckduckgo" && url.pathname.startsWith("/l/")) {
    target = url.searchParams.get("uddg");
  } else if (provider === "yahoo") {
    const match = /\/RU=([^/]+)\/RK=/i.exec(url.pathname);
    target = match?.[1] ? decodeURIComponent(match[1]) : null;
  }
  if (!target) {return undefined;}
  try {
    return new URL(target);
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

function isSearchNavigationTitle(title: string): boolean {
  return /^(?:images?|videos?|news|maps?|shopping|settings|sign in|next|previous|more results|search)$/i.test(title);
}

function cleanSnapshotLine(line: string): string {
  return cleanText(line
    .replace(/^\s*[-*]\s*/, "")
    .replace(/^(?:text|paragraph|heading|generic)(?:\s+"|:\s*)/i, "")
    .replace(/"\s*(?:\[ref=[^\]]+\])?\s*$/, ""));
}

function cleanText(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x3D;/gi, "=").replace(/&#39;/g, "'");
}
