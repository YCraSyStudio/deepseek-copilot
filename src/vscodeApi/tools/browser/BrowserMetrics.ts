import { logInfo } from "@/shared/logging/Logger";

interface BrowserRuntimeMetrics {
  optimizedMode: boolean;
  missingOptimizedTools: string[];
  providerAttempts: number;
  providerFallbacks: number;
  fallbackReasons: Record<string, number>;
  parsedCandidates: number;
  discardedResults: number;
  validUrlResults: number;
  returnedResults: number;
  searchCacheHits: number;
  documentCacheHits: number;
  browserRecreations: number;
  nativeOpens: number;
  receivedCharacters: number;
  returnedCharacters: number;
  totalDurationMs: number;
}

const metrics: BrowserRuntimeMetrics = {
  optimizedMode: false,
  missingOptimizedTools: [],
  providerAttempts: 0,
  providerFallbacks: 0,
  fallbackReasons: {},
  parsedCandidates: 0,
  discardedResults: 0,
  validUrlResults: 0,
  returnedResults: 0,
  searchCacheHits: 0,
  documentCacheHits: 0,
  browserRecreations: 0,
  nativeOpens: 0,
  receivedCharacters: 0,
  returnedCharacters: 0,
  totalDurationMs: 0,
};

export function configureBrowserMetrics(optimizedMode: boolean, missingOptimizedTools: readonly string[]): void {
  metrics.optimizedMode = optimizedMode;
  metrics.missingOptimizedTools = [...missingOptimizedTools];
}

export function recordBrowserMetric(
  name: Exclude<keyof BrowserRuntimeMetrics, "optimizedMode" | "missingOptimizedTools" | "fallbackReasons">,
  amount = 1,
): void {
  metrics[name] += amount;
}

export function recordBrowserFallback(reason: string): void {
  metrics.providerFallbacks += 1;
  metrics.fallbackReasons[reason] = (metrics.fallbackReasons[reason] ?? 0) + 1;
}

export function logBrowserOperation(
  operation: "search" | "open_result" | "open_url" | "read",
  provider: string | undefined,
  durationMs: number,
  receivedCharacters: number,
  returnedCharacters: number,
): void {
  recordBrowserMetric("totalDurationMs", durationMs);
  recordBrowserMetric("receivedCharacters", receivedCharacters);
  recordBrowserMetric("returnedCharacters", returnedCharacters);
  logInfo("[web] integrated browser operation", {
    operation,
    provider,
    durationMs,
    receivedCharacters,
    returnedCharacters,
  });
}

export function getBrowserRuntimeMetrics(): Record<string, unknown> {
  return { ...structuredClone(metrics) };
}
