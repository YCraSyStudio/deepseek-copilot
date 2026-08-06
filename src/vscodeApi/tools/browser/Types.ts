export const BROWSER_TOOL_IDS = {
  open: "open_browser_page",
  read: "read_page",
  navigate: "navigate_page",
  click: "click_element",
  listPages: "list_browser_pages",
} as const;

export const REQUIRED_BROWSER_TOOL_IDS = [
  BROWSER_TOOL_IDS.open,
  BROWSER_TOOL_IDS.read,
  BROWSER_TOOL_IDS.navigate,
  BROWSER_TOOL_IDS.click,
] as const;

export type BrowserToolId = typeof BROWSER_TOOL_IDS[keyof typeof BROWSER_TOOL_IDS];
export type SearchEngine = "auto" | "bing" | "duckduckgo" | "google" | "yahoo";
export type ResolvedSearchEngine = Exclude<SearchEngine, "auto">;

export interface BrowserToolHost {
  getToolNames(): readonly string[];
  invokeTool(name: BrowserToolId, input: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  getSearchEnginePreference(): string | undefined;
  getNativeSearchEnginePreference(): string | undefined;
  getLocale(): string;
  getChatToolsSetting(): boolean | undefined;
}

export interface IntegratedBrowserCapabilities {
  available: boolean;
  headless: boolean;
  missingTools: string[];
  chatToolsEnabled?: boolean;
}

export interface BrowserPageSnapshot {
  pageId: string;
  content: string;
  truncated: boolean;
}

export interface WebBrowserResult {
  kind: "web_browser_result";
  operation: "open" | "read" | "navigate" | "follow_link";
  pageId: string;
  url?: string;
  content: string;
  truncated: boolean;
  trust: "untrusted_web_content";
}

export interface WebSearchResultItem {
  id: string;
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
  ref?: string;
}

export interface WebSearchResult {
  kind: "web_search_result";
  query: string;
  provider: ResolvedSearchEngine;
  pageId: string;
  searchUrl: string;
  results: WebSearchResultItem[];
  content?: string;
  truncated: boolean;
  trust: "untrusted_web_content";
}
