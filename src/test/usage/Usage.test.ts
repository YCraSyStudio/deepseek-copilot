import * as assert from "node:assert";
import {
  aggregateUsageAggregates,
  aggregateUsageByModel,
  createUsageAggregate,
  estimateUsageCost,
  estimateReportedUsageCost,
  formatUsageSummary,
  isOfficialDeepSeekEndpoint,
  isProviderUsage,
  normalizeUsageAggregate,
  parseProviderUsage,
  PRICE_CATALOG_VERSION,
  recordUsage,
  USAGE_SCHEMA_VERSION,
} from "@/shared/usage/Usage";

suite("usage observability", () => {
  suite("parseProviderUsage", () => {
    test("normalizes the documented DeepSeek cache and nested reasoning fields", () => {
      const usage = parseProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
        prompt_cache_hit_tokens: 70,
        prompt_cache_miss_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 12 },
      });
      assert.deepStrictEqual(usage, {
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
        reasoning_tokens: 12,
        prompt_cache_hit_tokens: 70,
        prompt_cache_miss_tokens: 30,
      });
    });

    test("keeps valid required usage while treating malformed optional fields as unavailable", () => {
      const usage = parseProviderUsage({
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
        prompt_cache_hit_tokens: "invalid",
        completion_tokens_details: { reasoning_tokens: -1 },
      });
      assert.deepStrictEqual(usage, { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
      assert.ok(isProviderUsage(usage));
    });

    test("rejects malformed required usage without failing its enclosing response", () => {
      assert.strictEqual(parseProviderUsage(undefined), undefined);
      assert.strictEqual(parseProviderUsage(null), undefined);
      assert.strictEqual(parseProviderUsage("tokens"), undefined);
      assert.strictEqual(parseProviderUsage({}), undefined);
      assert.strictEqual(parseProviderUsage({ prompt_tokens: -1, completion_tokens: 2, total_tokens: 1 }), undefined);
      assert.strictEqual(parseProviderUsage({ prompt_tokens: 1.5, completion_tokens: 2, total_tokens: 3 }), undefined);
    });
  });

  test("recognizes only the official DeepSeek origin", () => {
    assert.strictEqual(isOfficialDeepSeekEndpoint("https://api.deepseek.com"), true);
    assert.strictEqual(isOfficialDeepSeekEndpoint("https://api.deepseek.com/v1"), true);
    assert.strictEqual(isOfficialDeepSeekEndpoint("https://example.com/api"), false);
    assert.strictEqual(isOfficialDeepSeekEndpoint("http://localhost:11434"), false);
  });

  suite("aggregation and availability", () => {
    test("counts each request once and keeps absent usage unavailable", () => {
      const aggregate = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      recordUsage(aggregate, "tool_round", {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20,
      });
      recordUsage(aggregate, "tool_round", undefined);
      recordUsage(aggregate, "security_review", {
        prompt_tokens: 30,
        completion_tokens: 5,
        total_tokens: 35,
      });

      assert.strictEqual(aggregate.count, 3);
      assert.strictEqual(aggregate.reported, 2);
      assert.strictEqual(aggregate.inputTokens, 130);
      assert.strictEqual(aggregate.outputTokens, 25);
      assert.strictEqual(aggregate.cacheHitTokens, 80);
      assert.strictEqual(aggregate.cacheMissTokens, 20);
      assert.strictEqual(aggregate.byPhase.tool_round?.requests, 2);
      assert.strictEqual(aggregate.byPhase.tool_round?.reported, 1);
      assert.strictEqual(aggregate.costUsd, undefined, "partial usage must not produce a partial cost");
    });

    test("does not turn entirely absent usage into zero", () => {
      const aggregate = createUsageAggregate(false, "custom-model");
      recordUsage(aggregate, "primary", undefined);
      assert.strictEqual(aggregate.count, 1);
      assert.strictEqual(aggregate.reported, 0);
      assert.strictEqual(aggregate.inputTokens, undefined);
      assert.strictEqual(aggregate.cacheMissTokens, undefined);
      assert.strictEqual(aggregate.costUsd, undefined);
    });

    test("combines generation aggregates into a conversation total", () => {
      const first = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      const second = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      recordUsage(first, "primary", completeUsage(100, 20, 75, 25));
      recordUsage(second, "security_review", completeUsage(50, 10, 40, 10));
      const conversation = aggregateUsageAggregates([first, second]);
      assert.strictEqual(conversation?.count, 2);
      assert.strictEqual(conversation?.reported, 2);
      assert.strictEqual(conversation?.inputTokens, 150);
      assert.strictEqual(conversation?.byPhase.security_review?.requests, 1);
      assert.strictEqual(conversation?.priceCatalogVersion, PRICE_CATALOG_VERSION);
      assert.strictEqual(conversation?.costUsd, rounded((first.costUsd ?? 0) + (second.costUsd ?? 0)));
    });

    test("keeps separate totals when a conversation changes models", () => {
      const flash = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      const pro = createUsageAggregate(true, "deepseek-v4-pro");
      recordUsage(flash, "primary", completeUsage(100, 20, 75, 25));
      recordUsage(pro, "tool_round", completeUsage(50, 10, 40, 10));

      const byModel = aggregateUsageByModel([flash, pro]);
      assert.deepStrictEqual(byModel.map((value) => [value.model, value.count, value.totalTokens]), [
        ["deepseek-v4-flash-vision-exp", 1, 120],
        ["deepseek-v4-pro", 1, 60],
      ]);
    });
  });

  suite("official price catalog", () => {
    test("uses the current V4 Flash and V4 Pro prices", () => {
      const usage = completeUsage(1_000, 100, 700, 300);
      assert.strictEqual(
        estimateUsageCost(usage, "deepseek-v4-flash-vision-exp"),
        rounded((300 * 0.14 + 700 * 0.0028 + 100 * 0.28) / 1_000_000),
      );
      assert.strictEqual(
        estimateUsageCost(usage, "deepseek-v4-pro"),
        rounded((300 * 0.435 + 700 * 0.003625 + 100 * 0.87) / 1_000_000),
      );
    });

    test("prices the reported subset as a lower bound when some requests omit usage", () => {
      const aggregate = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      recordUsage(aggregate, "tool_round", completeUsage(1_000, 100, 700, 300));
      recordUsage(aggregate, "tool_round", undefined);

      assert.strictEqual(aggregate.costUsd, undefined, "the persisted exact cost remains unavailable");
      assert.strictEqual(
        estimateReportedUsageCost(aggregate),
        rounded((300 * 0.14 + 700 * 0.0028 + 100 * 0.28) / 1_000_000),
      );
    });

    test("does not estimate unknown models or usage without cache attribution", () => {
      const incomplete = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };
      assert.strictEqual(estimateUsageCost(incomplete, "deepseek-v4-flash-vision-exp"), undefined);
      assert.strictEqual(estimateUsageCost(completeUsage(10, 2, 5, 5), "llama-3"), undefined);
    });

    test("never guesses a price for custom endpoints", () => {
      const aggregate = createUsageAggregate(false, "deepseek-v4-flash-vision-exp");
      recordUsage(aggregate, "primary", completeUsage(10, 5, 5, 5));
      assert.strictEqual(aggregate.costUsd, undefined);
      assert.strictEqual(aggregate.currency, undefined);
      assert.strictEqual(aggregate.priceCatalogVersion, undefined);
      assert.strictEqual(estimateReportedUsageCost(aggregate), undefined);
    });
  });

  suite("persistence validation", () => {
    test("round-trips a consistent aggregate", () => {
      const aggregate = createUsageAggregate(true, "deepseek-v4-pro");
      recordUsage(aggregate, "primary", completeUsage(10, 5, 6, 4));
      const restored = normalizeUsageAggregate(JSON.parse(JSON.stringify(aggregate)));
      assert.deepStrictEqual(restored, aggregate);
    });

    test("rejects malformed or internally inconsistent aggregates", () => {
      const aggregate = createUsageAggregate(false, "custom");
      recordUsage(aggregate, "primary", completeUsage(10, 5, 6, 4));
      assert.strictEqual(normalizeUsageAggregate(undefined), undefined);
      assert.strictEqual(normalizeUsageAggregate({ schemaVersion: USAGE_SCHEMA_VERSION + 1 }), undefined);
      assert.strictEqual(normalizeUsageAggregate({ ...aggregate, count: 2 }), undefined);
      assert.strictEqual(normalizeUsageAggregate({ ...aggregate, inputTokens: 999 }), undefined);
      assert.strictEqual(normalizeUsageAggregate({ ...aggregate, byPhase: { unknown_phase: aggregate.byPhase.primary } }), undefined);
    });

    test("rejects required totals when no request has reported usage", () => {
      const aggregate = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
      recordUsage(aggregate, "primary");
      const inconsistent = structuredClone(aggregate);
      inconsistent.inputTokens = 12;
      assert.strictEqual(normalizeUsageAggregate(inconsistent), undefined);
    });
  });

  test("saturates unsafe counters and stops calculating cost", () => {
    const aggregate = createUsageAggregate(true, "deepseek-v4-flash-vision-exp");
    const maximumUsage = {
      prompt_tokens: Number.MAX_SAFE_INTEGER,
      completion_tokens: Number.MAX_SAFE_INTEGER,
      total_tokens: Number.MAX_SAFE_INTEGER,
      prompt_cache_hit_tokens: Number.MAX_SAFE_INTEGER,
      prompt_cache_miss_tokens: Number.MAX_SAFE_INTEGER,
    };
    recordUsage(aggregate, "primary", maximumUsage);
    recordUsage(aggregate, "primary", maximumUsage);

    assert.strictEqual(aggregate.saturated, true);
    assert.strictEqual(aggregate.inputTokens, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(aggregate.costUsd, undefined);
  });

  test("formats a redacted summary with explicit unavailable values", () => {
    const aggregate = createUsageAggregate(false, "custom");
    recordUsage(aggregate, "primary", undefined);
    const summary = formatUsageSummary(aggregate);
    assert.ok(summary.includes("requests=1 reported=0 input=unavailable"));
    assert.ok(summary.includes("cacheMiss=unavailable"));
    assert.ok(!summary.includes("command") && !summary.includes("path"));
  });
});

function completeUsage(prompt: number, completion: number, hit: number, miss: number) {
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: miss,
  };
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
