export type SearchEngine = "auto" | "bing" | "duckduckgo" | "google" | "yahoo";
export type ResolvedSearchEngine = Exclude<SearchEngine, "auto">;

export interface WebSecurityMetadata {
  source: "live_web";
  active_content_removed: true;
  injection_risk: "none" | "suspected";
  content_hash: string;
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
  security: WebSecurityMetadata;
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
  security: WebSecurityMetadata;
}
