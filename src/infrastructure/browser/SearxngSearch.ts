import { createHash } from "node:crypto";
import { validatePublicWebUrl } from "./NetworkPolicy";
import type { SearchLocale } from "./SearchProviders";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;

export interface SearxngSearchResult {
  urls: string[];
  contentHash: string;
}

export function normalizeSearxngEndpoint(value: string): URL {
  let url: URL;
  try {url = new URL(value.trim());}
  catch {throw new Error("SearXNG endpoint must be a valid URL");}
  if (url.username || url.password) {throw new Error("SearXNG endpoint must not contain credentials");}
  const loopback = isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("SearXNG endpoint must use HTTPS, except for localhost/loopback HTTP");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

export async function searchSearxng(
  endpoint: string,
  query: string,
  locale: SearchLocale,
  limit: number,
  signal?: AbortSignal,
): Promise<SearxngSearchResult> {
  const url = normalizeSearxngEndpoint(endpoint);
  url.pathname = `${url.pathname}/search`.replace(/^\/\//, "/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", locale.tag);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("SearXNG request timed out")), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {abort();}

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {throw new Error(`SearXNG returned HTTP ${response.status}`);}
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new Error("SearXNG response exceeded the maximum allowed size");
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
      throw new Error("SearXNG response exceeded the maximum allowed size");
    }
    const parsed = parseResponse(body);
    const seen = new Set<string>();
    for (const result of parsed.results) {
      if (!result || typeof result !== "object") {continue;}
      const candidate = (result as { url?: unknown }).url;
      if (typeof candidate !== "string") {continue;}
      try {
        const normalized = validatePublicWebUrl(candidate).toString();
        seen.add(normalized);
      } catch {continue;}
      if (seen.size >= limit) {break;}
    }
    if (seen.size === 0) {throw new Error("SearXNG returned no usable public HTTPS results");}
    return {
      urls: [...seen],
      contentHash: createHash("sha256").update(body, "utf8").digest("hex"),
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function parseResponse(body: string): { results: unknown[] } {
  let parsed: unknown;
  try {parsed = JSON.parse(body) as unknown;}
  catch {throw new Error("SearXNG returned invalid JSON");}
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { results?: unknown }).results)) {
    throw new Error("SearXNG returned an unexpected response shape");
  }
  return { results: (parsed as { results: unknown[] }).results };
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]";
}
