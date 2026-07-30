import { DeepSeekApiError } from "@/deepseekApi/errors/DeepSeekApiError";
import { buildDeepSeekAuthHeaders } from "@/deepseekApi/auth/AuthHeaders";
import { ApiOriginError, assertSameApiOrigin, normalizeApiBaseUrl } from "@/shared/security/ApiOrigin";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const FETCH_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const MAX_REDIRECTS = 5;

interface DeepSeekFetchOptions {
  pathOrUrl: string;
  apiKey: string;
  baseUrl?: string;
  requestInit?: RequestInit;
}

export async function deepseekFetch(options: DeepSeekFetchOptions): Promise<Response> {
  const { pathOrUrl, apiKey, baseUrl = DEEPSEEK_BASE_URL, requestInit = {} } = options;
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const url = buildApiUrl(normalizedBaseUrl, pathOrUrl);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const signal = requestInit.signal ? AbortSignal.any([requestInit.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetchWithSameOriginRedirects(url, normalizedBaseUrl, apiKey, { ...requestInit, signal });
      if (response.ok) {return response;}

      if (attempt < MAX_ATTEMPTS && isRetryableStatus(response.status)) {
        const delay = getRetryDelayMs(response.headers.get("retry-after"), attempt);
        await response.body?.cancel();
        await wait(delay, requestInit.signal);
        continue;
      }
      await response.body?.cancel();
      throw new DeepSeekApiError(
        response.status,
        getSafeHttpErrorMessage(response.status),
        String(response.status),
      );
    } catch (error) {
      if (requestInit.signal?.aborted || isDeepSeekApiError(error) || error instanceof ApiOriginError || attempt === MAX_ATTEMPTS) {throw error;}
      await wait(getRetryDelayMs(null, attempt), requestInit.signal);
    }
  }
  throw new Error("DeepSeek request failed after retries");
}

export function buildApiUrl(baseUrl: string, pathOrUrl: string): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (/^[a-z][a-z\d+.-]*:/i.test(pathOrUrl)) {
    return assertSameApiOrigin(normalizedBaseUrl, pathOrUrl).toString();
  }
  const url = new URL(pathOrUrl.replace(/^\/+/, ""), `${normalizedBaseUrl}/`);
  return assertSameApiOrigin(normalizedBaseUrl, url.toString()).toString();
}

async function fetchWithSameOriginRedirects(
  initialUrl: string,
  baseUrl: string,
  apiKey: string,
  requestInit: RequestInit,
): Promise<Response> {
  let currentUrl = assertSameApiOrigin(baseUrl, initialUrl);
  let currentInit = { ...requestInit };

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(currentUrl, {
      ...currentInit,
      redirect: "manual",
      headers: buildDeepSeekAuthHeaders(apiKey, currentInit.headers || {}),
    });
    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }
    if (redirectCount === MAX_REDIRECTS) {
      await response.body?.cancel();
      throw new ApiOriginError("The API request exceeded the redirect limit.");
    }

    const redirectedUrl = new URL(location, currentUrl);
    await response.body?.cancel();
    currentUrl = assertSameApiOrigin(baseUrl, redirectedUrl.toString());
    currentInit = redirectedRequestInit(currentInit, response.status);
  }
  throw new ApiOriginError("The API request exceeded the redirect limit.");
}

function redirectedRequestInit(requestInit: RequestInit, status: number): RequestInit {
  const method = (requestInit.method ?? "GET").toUpperCase();
  if (status !== 303 && !((status === 301 || status === 302) && method === "POST")) {
    return requestInit;
  }
  const headers = new Headers(requestInit.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  return { ...requestInit, method: "GET", body: undefined, headers };
}

function getSafeHttpErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Invalid API credentials.";
    case 403:
      return "API access denied.";
    case 429:
      return "API rate limit exceeded.";
    default:
      return `API request failed with HTTP ${status}.`;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getRetryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {return Math.min(30_000, Math.max(0, seconds * 1_000));}
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) {return Math.min(30_000, Math.max(0, dateDelay));}
  }
  return Math.min(4_000, 500 * 2 ** (attempt - 1));
}

function wait(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));}
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isDeepSeekApiError(error: unknown): error is DeepSeekApiError {
  return error instanceof DeepSeekApiError;
}
