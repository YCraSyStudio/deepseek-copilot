import {
  BROWSER_TOOL_IDS,
  OPTIMIZED_BROWSER_TOOL_IDS,
  REQUIRED_BROWSER_TOOL_IDS,
  type BrowserPageInfo,
  type BrowserPageSnapshot,
  type BrowserToolHost,
  type IntegratedBrowserCapabilities,
} from "./Types";

const MAX_BROWSER_CONTENT_CHARS = 64 * 1024;
const PAGE_ID_PATTERN = /(?:^|\n)Page ID:\s*([^\s\n]+)/i;
const PAGE_URL_PATTERN = /(?:^|\n)(?:Page )?URL:\s*(https:\/\/[^\s\n]+)/i;
const PAGE_TITLE_PATTERN = /(?:^|\n)Page Title:\s*([^\n]+)/i;
const UNAVAILABLE_MESSAGE =
  "Integrated browser automation is unavailable. Enable workbench.browser.enableChatTools or contact your administrator.";

export class IntegratedBrowserBridge {
  constructor(private readonly host: BrowserToolHost) {}

  getCapabilities(): IntegratedBrowserCapabilities {
    const availableNames = new Set(this.host.getToolNames());
    const missingTools = REQUIRED_BROWSER_TOOL_IDS.filter((name) => !availableNames.has(name));
    const missingOptimizedTools = OPTIMIZED_BROWSER_TOOL_IDS.filter((name) => !availableNames.has(name));
    return {
      available: missingTools.length === 0,
      optimized: missingTools.length === 0 && missingOptimizedTools.length === 0,
      headless: false,
      missingTools,
      missingOptimizedTools,
      chatToolsEnabled: this.host.getChatToolsSetting(),
    };
  }

  getSearchEnginePreference(): string | undefined {return this.host.getSearchEnginePreference();}
  getNativeSearchEnginePreference(): string | undefined {return this.host.getNativeSearchEnginePreference();}
  getConfiguredLocale(): string | undefined {return this.host.getConfiguredLocale();}
  getSystemLocale(): string | undefined {return this.host.getSystemLocale();}
  getVsCodeLanguage(): string {return this.host.getVsCodeLanguage();}

  async openPage(url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.open, { url, forceNew: false }, signal);
    const pageId = extractPageId(content);
    if (!pageId) {throw new Error("The integrated browser opened a page but did not return a page ID.");}
    return createSnapshot(pageId, content);
  }

  async readPage(pageId: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.read, { pageId }, signal);
    return createSnapshot(pageId, content);
  }

  async listPages(signal?: AbortSignal): Promise<BrowserPageInfo[]> {
    if (!this.getCapabilities().optimized) {return [];}
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.listPages, {}, signal);
    return extractBrowserPages(content);
  }

  async navigatePage(pageId: string, url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.navigate, { pageId, type: "url", url }, signal);
    return createSnapshot(pageId, content);
  }

  async navigateBack(pageId: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.navigate, { pageId, type: "back" }, signal);
    return createSnapshot(pageId, content);
  }

  async typeInPage(pageId: string, ref: string, text: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    if (!this.getCapabilities().optimized) {throw new Error("Optimized browser typing is unavailable.");}
    const content = await this.host.invokeTool(
      BROWSER_TOOL_IDS.type,
      { pageId, ref, element: "searchbox", text, submit: true },
      signal,
    );
    return createSnapshot(pageId, content);
  }

  async clickElement(pageId: string, ref: string, element: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.click, { pageId, ref, element }, signal);
    return createSnapshot(pageId, content);
  }

  private assertAvailable(): void {
    if (!this.getCapabilities().available) {throw new Error(UNAVAILABLE_MESSAGE);}
  }
}

export function extractPageId(content: string): string | undefined {
  const value = PAGE_ID_PATTERN.exec(content)?.[1]?.trim();
  return value && value.length <= 512 ? value : undefined;
}

export function extractBrowserPages(content: string): BrowserPageInfo[] {
  const starts = [...content.matchAll(/(?:^|\n)Page ID:\s*([^\s\n]+)/gi)];
  const detailed = starts.flatMap((match, index) => {
    const pageId = match[1]?.trim();
    if (!pageId || pageId.length > 512) {return [];}
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? content.length;
    const block = content.slice(start, end);
    return [{
      pageId,
      title: PAGE_TITLE_PATTERN.exec(block)?.[1]?.trim(),
      url: PAGE_URL_PATTERN.exec(block)?.[1]?.trim(),
    }];
  });
  const listed: BrowserPageInfo[] = [];
  for (const match of content.matchAll(/^\s*-\s+\[([^\]]+)\]\s+(.+?)\s+\((https:\/\/.+)\)\s+\((?:active|visible|not visible)\)\s*$/gim)) {
    const pageId = match[1]?.trim();
    if (pageId && pageId.length <= 512) {
      listed.push({ pageId, title: match[2]?.trim(), url: match[3]?.trim() });
    }
  }
  return [...new Map([...detailed, ...listed].map((page) => [page.pageId, page])).values()];
}

function createSnapshot(pageId: string, content: string): BrowserPageSnapshot {
  const truncated = content.length > MAX_BROWSER_CONTENT_CHARS;
  const bounded = truncated ? `${content.slice(0, MAX_BROWSER_CONTENT_CHARS)}\n[Browser content truncated]` : content;
  return {
    pageId,
    content: bounded,
    truncated,
    title: PAGE_TITLE_PATTERN.exec(bounded)?.[1]?.trim(),
    url: PAGE_URL_PATTERN.exec(bounded)?.[1]?.trim(),
  };
}
