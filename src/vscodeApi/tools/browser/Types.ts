export const BROWSER_TOOL_IDS = {
  open: "open_browser_page",
  read: "read_page",
  navigate: "navigate_page",
  click: "click_element",
  listPages: "list_browser_pages",
  type: "type_in_page",
} as const;

export const REQUIRED_BROWSER_TOOL_IDS = [
  BROWSER_TOOL_IDS.open,
  BROWSER_TOOL_IDS.read,
  BROWSER_TOOL_IDS.navigate,
  BROWSER_TOOL_IDS.click,
] as const;

export const OPTIMIZED_BROWSER_TOOL_IDS = [
  BROWSER_TOOL_IDS.listPages,
  BROWSER_TOOL_IDS.type,
] as const;

export type BrowserToolId = typeof BROWSER_TOOL_IDS[keyof typeof BROWSER_TOOL_IDS];
export type SearchEngine = "auto" | "bing" | "duckduckgo" | "google" | "yahoo";
export type ResolvedSearchEngine = Exclude<SearchEngine, "auto">;

export interface BrowserToolHost {
  getToolNames(): readonly string[];
  invokeTool(name: BrowserToolId, input: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  getSearchEnginePreference(): string | undefined;
  getNativeSearchEnginePreference(): string | undefined;
  getConfiguredLocale(): string | undefined;
  getSystemLocale(): string | undefined;
  getVsCodeLanguage(): string;
  getChatToolsSetting(): boolean | undefined;
}

export interface IntegratedBrowserCapabilities {
  available: boolean;
  optimized: boolean;
  headless: boolean;
  missingTools: string[];
  missingOptimizedTools: string[];
  chatToolsEnabled?: boolean;
}

export interface BrowserPageSnapshot {
  pageId: string;
  content: string;
  truncated: boolean;
  title?: string;
  url?: string;
}

export interface BrowserPageInfo {
  pageId: string;
  title?: string;
  url?: string;
}

export interface WebSearchResultItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface InternalWebSearchResultItem extends WebSearchResultItem {
  ref?: string;
}

export interface WebSearchResult {
  kind: "web_search_result";
  search_id: string;
  provider: ResolvedSearchEngine;
  locale: string;
  results: WebSearchResultItem[];
  degraded?: string;
  cached?: boolean;
  trust: "untrusted_web_content";
}

export interface WebDocumentResult {
  kind: "web_document" | "web_document_fragment";
  document_id: string;
  title: string;
  url: string;
  content: string;
  outline?: string[];
  links?: Array<{ title: string; url: string }>;
  cursor?: string;
  next_cursor?: string;
  trust: "untrusted_web_content";
}
