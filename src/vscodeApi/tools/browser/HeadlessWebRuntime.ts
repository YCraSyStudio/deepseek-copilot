import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { BrowserManager } from "./BrowserManager";
import { SafeConnectProxy } from "./SafeConnectProxy";
import { WebAccessPolicy, validatePublicWebUrl } from "./NetworkPolicy";
import { DENIED_SANDBOX_BYPASS_ARGUMENT, getHeadlessRuntimeArguments } from "./BrowserLaunchPolicy";

const NAVIGATION_TIMEOUT_MS = 15_000;
const SETTLE_MS = 2_000;
const MAX_DOCUMENT_CHARS = 64 * 1024;
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "manifest", "websocket", "eventsource", "ping"]);

export interface RenderedLink {
  title: string;
  url: string;
  snippet?: string;
  sponsored?: boolean;
}

export interface RenderedPage {
  title: string;
  url: string;
  content: string;
  outline: string[];
  links: RenderedLink[];
  contentHash: string;
  injectionRisk: "none" | "suspected";
}

export class HeadlessWebRuntime {
  private active = 0;
  private waiting: Array<{ ready: () => void; reject: (error: Error) => void }> = [];
  private readonly browsers = new Set<Browser>();
  private disposed = false;
  private completed = 0;
  private failed = 0;
  private requests = 0;
  private transferredBytes = 0;
  private readonly blocked = new Map<string, number>();

  constructor(private readonly browserManager: Pick<BrowserManager, "resolve" | "getDiagnostics">) {}

  async render(url: string, policy: WebAccessPolicy, signal?: AbortSignal): Promise<RenderedPage> {
    await this.acquire(signal);
    const proxy = new SafeConnectProxy(policy);
    let browser: Browser | undefined;
    let profileDir: string | undefined;
    let succeeded = false;
    try {
      const target = policy.assertNavigationAllowed(validatePublicWebUrl(url).toString());
      const proxyPort = await proxy.start();
      const executable = await this.browserManager.resolve(true);
      profileDir = await fs.mkdtemp(path.join(tmpdir(), "yrs-dpsk-web-"));
      browser = await puppeteer.launch({
        executablePath: executable.path,
        headless: true,
        pipe: true,
        userDataDir: profileDir,
        ignoreDefaultArgs: ["--disable-popup-blocking", DENIED_SANDBOX_BYPASS_ARGUMENT],
        args: getHeadlessRuntimeArguments(proxyPort),
      });
      this.browsers.add(browser);
      if (this.disposed) {throw new Error("Web runtime is shutting down");}
      if (signal?.aborted) {throw new Error("Web navigation was cancelled");}
      const context = await browser.createBrowserContext({ downloadBehavior: { policy: "deny" } });
      const page = await context.newPage();
      await hardenPage(page, policy);
      const abort = (): void => {void page.close().catch(() => undefined);};
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        const finalUrl = policy.assertNavigationAllowed(page.url()).toString();
        const extracted = await extractVisibleDocument(page);
        const content = truncateUtf8(extracted.content.normalize("NFKC"), MAX_DOCUMENT_CHARS);
        succeeded = true;
        return {
          ...extracted,
          title: extracted.title.normalize("NFKC"),
          outline: extracted.outline.map((entry) => entry.normalize("NFKC")),
          links: extracted.links.map((entry) => ({ ...entry, title: entry.title.normalize("NFKC"), snippet: entry.snippet?.normalize("NFKC") })),
          url: finalUrl,
          content,
          contentHash: createHash("sha256").update(content).digest("hex"),
          injectionRisk: detectPromptInjection(content) ? "suspected" : "none",
        };
      } finally {
        signal?.removeEventListener("abort", abort);
        await context.close().catch(() => undefined);
      }
    } finally {
      succeeded ? this.completed += 1 : this.failed += 1;
      if (browser) {this.browsers.delete(browser);}
      await browser?.close().catch(() => undefined);
      await proxy.dispose().catch(() => undefined);
      if (profileDir) {await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);}
      const metrics = proxy.getMetrics();
      this.requests += metrics.requests;
      this.transferredBytes += metrics.transferredBytes;
      for (const [code, count] of Object.entries(metrics.blocked)) {this.blocked.set(code, (this.blocked.get(code) ?? 0) + count);}
      this.release();
    }
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      activeRuntimes: this.active, queuedRuntimes: this.waiting.length,
      completedNavigations: this.completed, failedNavigations: this.failed,
      requests: this.requests, transferredBytes: this.transferredBytes,
      blocked: Object.fromEntries(this.blocked),
      ...this.browserManager.getDiagnostics(),
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.waiting.splice(0).forEach(({ reject }) => reject(new Error("Web runtime is shutting down")));
    await Promise.allSettled([...this.browsers].map((browser) => browser.close()));
    this.browsers.clear();
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    if (this.disposed) {throw new Error("Web runtime is shutting down");}
    if (signal?.aborted) {throw new Error("Web runtime acquisition cancelled");}
    if (this.active < 2) {this.active += 1; return;}
    await new Promise<void>((resolve, reject) => {
      const ready = (): void => {
        signal?.removeEventListener("abort", aborted);
        if (this.disposed) {reject(new Error("Web runtime is shutting down")); return;}
        this.active += 1;
        resolve();
      };
      const aborted = (): void => {
        this.waiting = this.waiting.filter((entry) => entry.ready !== ready);
        reject(new Error("Web runtime acquisition cancelled"));
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

async function hardenPage(page: Page, policy: WebAccessPolicy): Promise<void> {
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(() => {
    window.open = () => null;
  });
  page.on("dialog", (dialog) => {void dialog.dismiss();});
  page.on("popup", (popup) => {if (popup) {void popup.close().catch(() => undefined);}});
  await page.setRequestInterception(true);
  let requestCount = 0;
  page.on("request", (request) => {
    let allowed = false;
    try {
      const url = new URL(request.url());
      allowed = ++requestCount <= 64 && url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
        policy.isAllowedHostname(url.hostname) && request.redirectChain().length <= 5;
      if (allowed && request.isNavigationRequest()) {
        allowed = request.frame() === page.mainFrame();
        if (allowed) {policy.assertNavigationAllowed(url.toString());}
      }
    } catch {allowed = false;}
    if (!allowed || !ALLOWED_METHODS.has(request.method()) || BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      void request.abort("blockedbyclient");
    } else {
      void request.continue();
    }
  });
}

async function extractVisibleDocument(page: Page): Promise<Omit<RenderedPage, "contentHash" | "injectionRisk">> {
  return page.evaluate(() => {
    const hidden = (element: Element): boolean => {
      if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {return true;}
      const style = window.getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
    };
    for (const element of document.querySelectorAll("script,style,noscript,iframe,form,input,button,svg,canvas,template")) {
      element.remove();
    }
    for (const element of document.querySelectorAll("[hidden],[aria-hidden='true']")) {element.remove();}
    const root = document.querySelector("main,article,[role='main']") ?? document.body;
    const structuredText = [...root.querySelectorAll("h1,h2,h3,h4,p,li,pre,code,blockquote,dt,dd,tr")]
      .filter((element) => !hidden(element))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const content = structuredText.length > 0
      ? structuredText.join("\n")
      : ((root as HTMLElement).innerText ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const outline = [...root.querySelectorAll("h1,h2,h3,h4")]
      .filter((element) => !hidden(element))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 24);
    const host = location.hostname.toLowerCase();
    const providerSelector = host.includes("bing.com") ? "li.b_algo h2 a[href]" :
      host.includes("duckduckgo.com") ? "a[data-testid='result-title-a'][href],a.result__a[href]" :
      host.includes("google.") || host === "google.com" ? "a[href] h3" :
      host.includes("yahoo.com") ? ".algo h3 a[href],h3.title a[href]" : undefined;
    const providerCandidates = providerSelector
      ? [...document.querySelectorAll(providerSelector)].map((element) => element.closest("a[href]") ?? element)
      : [];
    const candidates = providerCandidates.length > 0 ? providerCandidates : [...root.querySelectorAll("a[href]")];
    const links = candidates.flatMap((element) => {
      if (hidden(element)) {return [];}
      const anchor = element as HTMLAnchorElement;
      const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!title || !anchor.href.startsWith("https://")) {return [];}
      const block = anchor.closest("article,li,div")?.textContent?.replace(/\s+/g, " ").trim() ?? title;
      const sponsored = /\b(?:ad|ads|sponsored|patrocinado|anuncio|shopping)\b/i.test(block.slice(0, 500));
      return [{ title: title.slice(0, 160), url: anchor.href, snippet: block.slice(0, 280), sponsored }];
    }).slice(0, 200);
    return { title: document.title.slice(0, 240), url: location.href, content, outline, links };
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
