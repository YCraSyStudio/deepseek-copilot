## Context

The provider response types and generation records currently discard DeepSeek `usage` data. The extension therefore cannot distinguish prompt cache hits from misses, primary-agent cost from auxiliary security/compaction calls, or an efficient turn from one that repeatedly resends large tool results.

Without this baseline, token optimizations can only be inferred from request size and may move cost between phases without reducing it.

## Objective

Provide privacy-safe, provider-reported token and cache observability per request phase, generation, and conversation so optimizations can be measured rather than inferred.

## To-Do List

- [ ] Parse and validate usage from streaming and non-streaming responses, including:
  - prompt/input tokens;
  - completion/output tokens;
  - reasoning tokens when supplied;
  - `prompt_cache_hit_tokens`;
  - `prompt_cache_miss_tokens`.
- [ ] Attribute every request to a stable phase such as `primary`, `tool_round`, `security_review`, `context_summary`, or `file_compaction`.
- [ ] Aggregate usage per generation and conversation without storing prompt, command, path, file, or response contents.
- [ ] Show an optional local usage breakdown and expose a redacted diagnostic summary suitable for comparing releases.
- [ ] Calculate currency only for an official endpoint and a versioned price catalog. For custom endpoints, report tokens and cache ratios without guessing a price.
- [ ] Add configurable warning budgets for auxiliary calls, cache-miss input, output, and total generation cost. Warnings must not silently truncate or cancel work.
- [ ] Document that provider-side context caching is best-effort and that reported usage is authoritative.

- [ ] A multi-round tool generation reports each provider request exactly once and totals equal the sum of its phases.
- [ ] Cache-hit and cache-miss tokens are visible separately when DeepSeek returns them.
- [ ] Security reviews and compaction calls cannot be mistaken for primary generation usage.
- [ ] Missing or malformed usage fields do not fail an otherwise valid response and are shown as unavailable, never as zero.
- [ ] Incognito mode keeps usage only in memory; persistent diagnostics contain aggregates but no sensitive content.
- [ ] Unit tests cover streamed final usage, non-streamed usage, absent usage, partial streams, retries that are safe to retry, and official versus custom endpoints.
- [ ] Documentation explains the measurement boundary and how to compare cache hit rate before and after an optimization.
