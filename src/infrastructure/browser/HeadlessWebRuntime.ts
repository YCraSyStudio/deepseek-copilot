import { createHash, randomInt } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { BrowserExecutable } from "./BrowserDiscovery";
import type { SearchProvider } from "./SearchProviders";
import { SafeConnectProxy } from "./SafeConnectProxy";
import { WebAccessPolicy, validatePublicWebUrl } from "./NetworkPolicy";
import { DENIED_SANDBOX_BYPASS_ARGUMENT, getHeadlessRuntimeArguments } from "./BrowserLaunchPolicy";
import { createAbortError, throwIfAborted } from "@/shared/utils/Cancellation";

const NAVIGATION_TIMEOUT_MS = 15_000;
const SETTLE_MS = 2_000;
const MAX_DOCUMENT_CHARS = 64 * 1024;
const PROFILE_PREFIX = "yrs-dpsk-web-session-";
const STALE_PROFILE_AGE_MS = 24 * 60 * 60_000;
const MAX_READ_REQUESTS = 96;
const MAX_SEARCH_REQUESTS = 256;
const MAX_WAITING_OPERATIONS = 32;
const READ_METHODS = new Set(["GET", "HEAD"]);
const SEARCH_METHODS = new Set(["GET", "HEAD", "POST"]);
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "manifest", "websocket", "eventsource", "ping"]);
const CAPTCHA_PATTERN = /unusual traffic|verify (?:that )?you are human|un último paso|resuelve el desafío|comprueba que eres humano|人机验证|安全验证|请输入验证码/i;

export interface RenderedLink {
  title: string;
  url: string;
  snippet?: string;
  sponsored?: boolean;
}

export interface BrowserManagerPort {
  resolve(allowInstall?: boolean): Promise<BrowserExecutable>;
  getDiagnostics(): Record<string, unknown>;
}

export interface RenderedPage {
  title: string;
  url: string;
  content: string;
  sections?: string[];
  outline: string[];
  links: RenderedLink[];
  contentHash: string;
  injectionRisk: "none" | "suspected";
}

class CaptchaChallengeError extends Error {
  constructor() {super("The search provider requires a CAPTCHA");}
}

export class HeadlessWebRuntime {
  private active = 0;
  private waiting: Array<{ ready: () => void; reject: (error: Error) => void }> = [];
  private readonly browsers = new Set<Browser>();
  private profileDirectory?: Promise<string>;
  private profileCleanup?: Promise<void>;
  private disposed = false;
  private completed = 0;
  private failed = 0;
  private requests = 0;
  private transferredBytes = 0;
  private readonly blocked = new Map<string, number>();

  constructor(
    private readonly browserManager: BrowserManagerPort,
  ) {}

  async render(
    url: string,
    policy: WebAccessPolicy,
    signal?: AbortSignal,
    settleMs = SETTLE_MS,
  ): Promise<RenderedPage> {
    return this.navigate(url, policy, signal, false, async (page, target) => {
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      if (settleMs > 0) {await delay(settleMs, signal);}
    });
  }

  async search(
    homeUrl: string,
    query: string,
    policy: WebAccessPolicy,
    signal: AbortSignal | undefined,
    locale: string | undefined,
    provider: SearchProvider,
  ): Promise<RenderedPage> {
    return this.navigate(
      homeUrl,
      policy,
      signal,
      true,
      (page, target) => this.performSearch(page, target, query, provider, locale, signal),
    );
  }

  private async performSearch(
    page: Page,
    target: URL,
    query: string,
    provider: SearchProvider,
    locale: string | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    if (locale) {await page.setExtraHTTPHeaders({ "Accept-Language": locale });}
    await page.setViewport({ width: 1365, height: 768, deviceScaleFactor: 1 });
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    let input = await waitForVisibleSearchInput(page, provider.inputSelector, 5_000);
    if (!input && await hasCaptcha(page)) {
      throw new CaptchaChallengeError();
    }
    if (!input) {throw new Error("Search provider did not expose a usable search field");}
    await delay(500, signal);
    let entered = false;
    for (let attempt = 0; attempt < 2 && !entered; attempt += 1) {
      input = await waitForVisibleSearchInput(page, provider.inputSelector, 2_000);
      if (!input) {break;}
      await input.click({ count: 3 });
      await input.press("Backspace");
      await typeLikeHuman(input, query);
      entered = await input.evaluate((element, expected) =>
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.value === expected, query);
      if (!entered) {await delay(500, signal);}
    }
    if (!input || !entered) {throw new Error("Search provider changed the query field while it was being typed");}
    const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS }).catch(() => null);
    await input.press("Enter");
    await navigation;
    await waitForSearchOutcome(page, provider.resultSelector);
    if (await hasCaptcha(page)) {throw new CaptchaChallengeError();}
    await page.waitForSelector(provider.resultSelector, { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
  }

  private async navigate(
    url: string,
    policy: WebAccessPolicy,
    signal: AbortSignal | undefined,
    searchMode: boolean,
    action: (page: Page, target: URL) => Promise<void>,
  ): Promise<RenderedPage> {
    await this.acquire(signal);
    let proxy: SafeConnectProxy | undefined;
    let browser: Browser | undefined;
    let page: Page | undefined;
    let succeeded = false;
    try {
      const target = policy.assertNavigationAllowed(validatePublicWebUrl(url).toString());
      proxy = new SafeConnectProxy(policy);
      const proxyPort = await proxy.start();
      const executable = await this.browserManager.resolve(true);
      const profileDirectory = await this.getProfileDirectory();
      browser = await puppeteer.launch({
        executablePath: executable.path,
        headless: true,
        pipe: true,
        userDataDir: profileDirectory,
        ignoreDefaultArgs: ["--disable-popup-blocking", DENIED_SANDBOX_BYPASS_ARGUMENT],
        args: getHeadlessRuntimeArguments(proxyPort),
      });
      this.browsers.add(browser);
      const context = browser.defaultBrowserContext();
      const existingPages = await browser.pages();
      page = existingPages[0] ?? await context.newPage();
      if (this.disposed) {throw new Error("Web runtime is shutting down");}
      throwIfAborted(signal, "Web navigation was cancelled");
      if (!page) {throw new Error("Web browser did not provide a page");}
      const activePage = page;
      await hardenPage(activePage, policy, searchMode);
      const abort = (): void => {void activePage.close().catch(() => undefined);};
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await action(activePage, target);
        const finalUrl = policy.assertNavigationAllowed(activePage.url()).toString();
        const extracted = await extractVisibleDocumentWithRetry(activePage);
        const sections = extracted.sections.map((entry) => entry.normalize("NFKC"));
        const content = truncateUtf8(sections.join("\n\n"), MAX_DOCUMENT_CHARS);
        succeeded = true;
        return {
          ...extracted,
          title: extracted.title.normalize("NFKC"),
          sections,
          outline: [],
          links: extracted.links.map((entry) => ({ ...entry, title: entry.title.normalize("NFKC"), snippet: entry.snippet?.normalize("NFKC") })),
          url: finalUrl,
          content,
          contentHash: createHash("sha256").update(content).digest("hex"),
          injectionRisk: detectPromptInjection(content) ? "suspected" : "none",
        };
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw createAbortError("Web operation cancelled");
      }
      throw error;
    } finally {
      succeeded ? this.completed += 1 : this.failed += 1;
      if (browser) {this.browsers.delete(browser);}
      await browser?.close().catch(() => undefined);
      if (proxy) {
        this.recordProxyMetrics(proxy.getMetrics());
        await proxy.dispose().catch(() => undefined);
      }
      this.release();
    }
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      activeRuntimes: this.active,
      queuedRuntimes: this.waiting.length,
      completedNavigations: this.completed,
      failedNavigations: this.failed,
      sessionProfile: this.profileDirectory ? "active" : "not-created",
      requests: this.requests,
      transferredBytes: this.transferredBytes,
      blocked: Object.fromEntries(this.blocked),
      ...this.browserManager.getDiagnostics(),
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.waiting.splice(0).forEach(({ reject }) => reject(new Error("Web runtime is shutting down")));
    await Promise.allSettled([...this.browsers].map((browser) => browser.close()));
    this.browsers.clear();
    const profile = await this.profileDirectory?.catch(() => undefined);
    if (profile) {await fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);}
    this.profileDirectory = undefined;
  }

  private async getProfileDirectory(): Promise<string> {
    if (!this.profileDirectory) {
      this.profileDirectory = (async () => {
        if (!this.profileCleanup) {this.profileCleanup = cleanupStaleProfiles();}
        await this.profileCleanup;
        return fs.mkdtemp(path.join(tmpdir(), PROFILE_PREFIX));
      })();
    }
    return this.profileDirectory;
  }

  private recordProxyMetrics(metrics: ReturnType<SafeConnectProxy["getMetrics"]>): void {
    this.requests += metrics.requests;
    this.transferredBytes += metrics.transferredBytes;
    for (const [code, count] of Object.entries(metrics.blocked)) {
      this.blocked.set(code, (this.blocked.get(code) ?? 0) + count);
    }
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    if (this.disposed) {throw new Error("Web runtime is shutting down");}
    throwIfAborted(signal, "Web runtime acquisition cancelled");
    if (this.active < 1) {this.active += 1; return;}
    if (this.waiting.length >= MAX_WAITING_OPERATIONS) {
      throw new Error("Web runtime resource limit reached; too many operations are waiting");
    }
    await new Promise<void>((resolve, reject) => {
      const ready = (): void => {
        signal?.removeEventListener("abort", aborted);
        if (this.disposed) {reject(new Error("Web runtime is shutting down")); return;}
        this.active += 1;
        resolve();
      };
      const aborted = (): void => {
        this.waiting = this.waiting.filter((entry) => entry.ready !== ready);
        reject(createAbortError("Web runtime acquisition cancelled"));
      };
      signal?.addEventListener("abort", aborted, { once: true });
      this.waiting.push({ ready, reject });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiting.shift()?.ready();
  }
}

async function cleanupStaleProfiles(): Promise<void> {
  const directory = tmpdir();
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(PROFILE_PREFIX)).map(async (entry) => {
    const target = path.join(directory, entry.name);
    const stat = await fs.stat(target).catch(() => undefined);
    if (stat && now - stat.mtimeMs > STALE_PROFILE_AGE_MS) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
    }
  }));
}

async function hardenPage(
  page: Page,
  policy: WebAccessPolicy,
  searchMode: boolean,
): Promise<void> {
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(() => {window.open = () => null;});
  page.on("dialog", (dialog) => {void dialog.dismiss();});
  page.on("popup", (popup) => {if (popup) {void popup.close().catch(() => undefined);}});
  await page.setRequestInterception(true);
  let requestCount = 0;
  const methods = searchMode ? SEARCH_METHODS : READ_METHODS;
  const maxRequests = searchMode ? MAX_SEARCH_REQUESTS : MAX_READ_REQUESTS;
  page.on("request", (request) => {
    let allowed = false;
    try {
      const requestUrl = new URL(request.url());
      const mainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
      if (mainNavigation && request.redirectChain().length === 0) {requestCount = 0;}
      const resourceType = request.resourceType();
      const eligible = methods.has(request.method()) && !BLOCKED_RESOURCE_TYPES.has(resourceType);
      allowed = eligible && ++requestCount <= maxRequests && requestUrl.protocol === "https:" && !requestUrl.username && !requestUrl.password &&
        (!requestUrl.port || requestUrl.port === "443") && policy.isAllowedHostname(requestUrl.hostname) && request.redirectChain().length <= 5;
      if (allowed && mainNavigation) {policy.assertNavigationAllowed(requestUrl.toString());}
    } catch {allowed = false;}
    if (!allowed) {void request.abort("blockedbyclient");} else {void request.continue();}
  });
}

async function findVisibleSearchInput(page: Page, selector: string) {
  const candidates = await page.$$(selector);
  for (const candidate of candidates) {
    const usable = await candidate.evaluate((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) || element.disabled || element.readOnly) {return false;}
      const bounds = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    if (usable) {return candidate;}
  }
  return undefined;
}

async function typeLikeHuman(input: Awaited<ReturnType<typeof findVisibleSearchInput>>, value: string): Promise<void> {
  if (!input) {return;}
  for (const character of value) {
    await input.type(character);
    await delay(randomInt(25, 66) + (character === " " ? randomInt(20, 61) : 0));
  }
}

async function waitForVisibleSearchInput(page: Page, selector: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  do {
    const input = await findVisibleSearchInput(page, selector);
    if (input) {return input;}
    if (await hasCaptcha(page)) {return undefined;}
    await delay(100);
  } while (Date.now() < deadline);
  return undefined;
}

async function waitForSearchOutcome(page: Page, resultSelector: string): Promise<void> {
  await Promise.race([
    page.waitForSelector(resultSelector, { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined),
    page.waitForFunction(() => Boolean(document.querySelector("#captcha,[class*='captcha' i],iframe[src*='captcha' i]")) || /unusual traffic|verify (?:that )?you are human|un último paso|resuelve el desafío|comprueba que eres humano|人机验证|安全验证|请输入验证码/i.test(document.body?.innerText ?? ""), { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => undefined),
  ]);
}

async function hasCaptcha(page: Page): Promise<boolean> {
  const result = await page.evaluate(() => ({
    challenge: Boolean(document.querySelector("#captcha,[class*='captcha' i],iframe[src*='captcha' i]")),
    text: (document.body?.innerText ?? "").slice(0, 20_000),
  })).catch(() => ({ challenge: false, text: "" }));
  return result.challenge || CAPTCHA_PATTERN.test(result.text);
}

async function extractVisibleDocumentWithRetry(page: Page): Promise<{ title: string; url: string; content: string; sections: string[]; outline: string[]; links: RenderedLink[] }> {
  try {return await extractVisibleDocument(page);}
  catch (error: unknown) {
    if (!/detached Frame|Execution context was destroyed/i.test(error instanceof Error ? error.message : "")) {throw error;}
    await delay(200);
    return extractVisibleDocument(page);
  }
}

async function extractVisibleDocument(page: Page): Promise<{ title: string; url: string; content: string; sections: string[]; outline: string[]; links: RenderedLink[] }> {
  return page.evaluate(() => {
    const hidden = (element: Element): boolean => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") {return true;}
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {return true;}
      }
      return false;
    };
    for (const element of document.body?.querySelectorAll("script,style,noscript,iframe,form,input,button,svg,canvas,template,meta,link") ?? []) {
      element.remove();
    }
    for (const element of [...(document.body?.querySelectorAll("[hidden],[aria-hidden='true']") ?? [])]) {element.remove();}
    const root = document.body;
    const sections: string[] = [];
    let current: string[] = [];
    let seen = new Set<string>();
    const pageTitle = (document.title || "Web page").replace(/\s+/g, " ").trim();
    const flush = (): void => {
      if (current.length > 0) {sections.push(current.join("\n\n")); current = [];}
    };
    for (const element of [...(root?.querySelectorAll("h1,h2,h3,h4,h5,h6,p") ?? [])]) {
      if (hidden(element)) {continue;}
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const key = text.toLocaleLowerCase();
      if (!text) {continue;}
      if (element.tagName === "H1") {
        flush();
        current.push(text);
        seen = new Set([key]);
        continue;
      }
      if (seen.has(key)) {continue;}
      seen.add(key);
      if (current.length === 0 && pageTitle) {current.push(pageTitle);}
      current.push(text);
    }
    flush();
    if (sections.length === 0 && pageTitle) {sections.push(pageTitle);}

    const host = location.hostname.toLowerCase();
    const providerSelector = host === "bing.com" || host.endsWith(".bing.com") ? "li.b_algo h2 a[href]" :
      host === "google.com" || host.includes(".google.") || host.startsWith("google.") ? "a[href] h3" :
      host === "baidu.com" || host.endsWith(".baidu.com") ? "#content_left h3 a[href],#content_left a[data-landurl]" : undefined;
    const candidates = providerSelector ? [...document.querySelectorAll(providerSelector)] : [];
    const links = candidates.flatMap((element) => {
      const anchor = (element.closest("a[href]") ?? element) as HTMLAnchorElement;
      // Search providers can reveal result anchors with client-side scripts. Those scripts are
      // intentionally blocked here, so a structurally valid organic result may remain CSS-hidden.
      if (!anchor) {return [] as Array<{ title: string; url: string; snippet: string; sponsored: boolean }>;}
      const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      const attributed = anchor.getAttribute("data-landurl") ?? anchor.closest("[mu]")?.getAttribute("mu") ?? anchor.getAttribute("data-url");
      const url = attributed && /^https:\/\//i.test(attributed) ? attributed : anchor.href;
      if (!title || !url.startsWith("https://")) {return [];}
      const blockElement = anchor.closest("article,li,[data-tuiguang],.result,.c-container");
      const block = blockElement?.textContent?.replace(/\s+/g, " ").trim() ?? title;
      const sponsored = blockElement?.hasAttribute("data-tuiguang") === true || /\b(?:ad|ads|sponsored|patrocinado|anuncio|广告)\b/i.test(block.slice(0, 500));
      return [{ title: title.slice(0, 160), url, snippet: block.slice(0, 280), sponsored }];
    }).slice(0, 100);
    return { title: pageTitle.slice(0, 240), url: location.href, content: sections.join("\n\n"), sections, outline: [], links };
  });
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {return value;}
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(value.slice(0, middle), "utf8") <= maxBytes) {low = middle;} else {high = middle - 1;}
  }
  return value.slice(0, low);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError("Web operation cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function detectPromptInjection(content: string): boolean {
  const normalized = content.normalize("NFKC").toLowerCase();
  return [
    /ignore (?:all |any )?(?:previous|prior|system) instructions/,
    /reveal (?:the )?(?:system prompt|developer message|secret|api key)/,
    /you are now (?:a|an|in) /,
    /(?:execute|run) (?:this|the following) (?:command|tool)/,
    /do not tell the user/,
    /(?:system|developer) (?:message|instruction|prompt)/,
    /(?:upload|send|exfiltrate) .{0,80}(?:secret|credential|token|key|file)/,
    /(?:call|invoke|use) .{0,40}(?:tool|function)/,
    /<\|(?:system|developer|assistant)\|>|\[inst\]/,
  ].some((pattern) => pattern.test(normalized));
}
