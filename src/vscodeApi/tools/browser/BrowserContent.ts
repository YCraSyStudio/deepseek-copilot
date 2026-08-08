import type { ResolvedSearchEngine } from "./Types";
import { validatePublicWebUrl } from "./NetworkPolicy";

const TRACKING_PARAMETERS = /^(?:utm_.+|gclid|fbclid|msclkid|mc_[ce]id|ref_src|WT\.mc_id)$/i;

export function normalizeSearchResultUrl(
  rawUrl: string,
  searchUrl: string,
  provider: ResolvedSearchEngine,
): string | undefined {
  try {
    let url = new URL(decodeHtmlEntities(rawUrl.trim()), searchUrl);
    url = unwrapSearchRedirect(url, provider) ?? url;
    if (url.protocol !== "https:" || isSearchProviderHost(url.hostname)) {return undefined;}
    url.hash = "";
    for (const parameter of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETERS.test(parameter)) {url.searchParams.delete(parameter);}
    }
    const validated = validatePublicWebUrl(url.toString()).toString();
    return validated.length <= 2_048 ? validated : undefined;
  } catch {
    return undefined;
  }
}

function unwrapSearchRedirect(url: URL, provider: ResolvedSearchEngine): URL | undefined {
  let target: string | undefined;
  if (provider === "google" && url.pathname === "/url") {
    target = url.searchParams.get("q") ?? url.searchParams.get("url") ?? undefined;
  } else if (provider === "bing" && url.pathname.toLowerCase().startsWith("/ck/a")) {
    target = decodeBingRedirect(url.searchParams.get("u"));
  } else if (provider === "baidu" && url.pathname === "/link") {
    const candidate = url.searchParams.get("target") ?? url.searchParams.get("url");
    target = candidate && /^https:\/\//i.test(candidate) ? candidate : undefined;
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
  } catch {return undefined;}
}

function isSearchProviderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "bing.com" || host.endsWith(".bing.com") ||
    host === "google.com" || host.includes(".google.") || host.startsWith("google.") ||
    host === "baidu.com" || host.endsWith(".baidu.com");
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#x3D;/gi, "=").replace(/&quot;/gi, "\"");
}

function safeDecodeURIComponent(value: string): string {
  try {return decodeURIComponent(value);} catch {return value;}
}
