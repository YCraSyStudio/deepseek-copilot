import {
  BROWSER_TOOL_IDS,
  REQUIRED_BROWSER_TOOL_IDS,
  type BrowserPageSnapshot,
  type BrowserToolHost,
  type IntegratedBrowserCapabilities,
} from "./Types";

const MAX_BROWSER_CONTENT_CHARS = 64 * 1024;
const PAGE_ID_PATTERN = /(?:^|\n)Page ID:\s*([^\s\n]+)/i;
const UNAVAILABLE_MESSAGE =
  "Integrated browser automation is unavailable. Enable workbench.browser.enableChatTools or contact your administrator.";

export class IntegratedBrowserBridge {
  constructor(private readonly host: BrowserToolHost) {}

  getCapabilities(): IntegratedBrowserCapabilities {
    const availableNames = new Set(this.host.getToolNames());
    const missingTools = REQUIRED_BROWSER_TOOL_IDS.filter((name) => !availableNames.has(name));
    return {
      available: missingTools.length === 0,
      headless: false,
      missingTools,
      chatToolsEnabled: this.host.getChatToolsSetting(),
    };
  }

  getSearchEnginePreference(): string | undefined {
    return this.host.getSearchEnginePreference();
  }

  getNativeSearchEnginePreference(): string | undefined {
    return this.host.getNativeSearchEnginePreference();
  }

  getLocale(): string {
    return this.host.getLocale();
  }

  async openPage(url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(
      BROWSER_TOOL_IDS.open,
      { url, forceNew: true },
      signal,
    );
    const pageId = extractPageId(content);
    if (!pageId) {
      throw new Error("The integrated browser opened a page but did not return a page ID.");
    }
    return createSnapshot(pageId, content);
  }

  async readPage(pageId: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(BROWSER_TOOL_IDS.read, { pageId }, signal);
    return createSnapshot(pageId, content);
  }

  async navigatePage(pageId: string, url: string, signal?: AbortSignal): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(
      BROWSER_TOOL_IDS.navigate,
      { pageId, type: "url", url },
      signal,
    );
    return createSnapshot(pageId, content);
  }

  async clickElement(
    pageId: string,
    ref: string,
    element: string,
    signal?: AbortSignal,
  ): Promise<BrowserPageSnapshot> {
    this.assertAvailable();
    const content = await this.host.invokeTool(
      BROWSER_TOOL_IDS.click,
      { pageId, ref, element },
      signal,
    );
    return createSnapshot(pageId, content);
  }

  private assertAvailable(): void {
    if (!this.getCapabilities().available) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }
  }
}

export function extractPageId(content: string): string | undefined {
  const value = PAGE_ID_PATTERN.exec(content)?.[1]?.trim();
  return value && value.length <= 512 ? value : undefined;
}

function createSnapshot(pageId: string, content: string): BrowserPageSnapshot {
  const truncated = content.length > MAX_BROWSER_CONTENT_CHARS;
  return {
    pageId,
    content: truncated
      ? `${content.slice(0, MAX_BROWSER_CONTENT_CHARS)}\n[Browser content truncated]`
      : content,
    truncated,
  };
}
