## Context

Every tool round resends the conversation and tool schemas. DeepSeek discounts matching input prefixes, but cache reuse is best-effort and requires byte-stable prefixes. That discount is now the dominant cost lever for agent workloads: DeepSeek's own V4.1-Flash announcement states that cache-hit spend typically dominates Agent usage, and the new model shrinks the KV cache substantially to reduce it further.

Measured on this repository's own telemetry, tool rounds account for almost all of the spend. In the conversation captured by the built-in usage panel: 766 requests, 35.9M total tokens, 80% cache hit, ≥$1.34, with 35M of the 35.6M input tokens and 324K of the 345K output tokens belonging to Tool calls. The provider dashboard for the same day shows 978 requests / 45.5M tokens, of which 36.3M are cache-hit input and 8.75M cache-miss input. Auxiliary phases are comparatively cheap (Completion review 83.4K, Progress review 336K, Security review 137.1K input tokens), so the priority is cache-miss input, not auxiliary substitution.

Separately, security review and context compaction use the conversation's selected model even though they disable thinking and perform small structured tasks. Compaction can also reserve a broad 4,096-token auxiliary output for summaries/range selection and may send more source material than a deterministic first pass needs.

### Pricing changed on 2026-09-10

Two verified facts from the official pages (retrieved 2026-09-10) constrain the benchmark and the price catalog:

- The new V4.1-Flash prices took effect **2026-09-10 12:00 Beijing time (04:00 UTC)**. Peak pricing is 2x and applies on weekdays 09:00-12:00 and 14:00-18:00 Beijing time (01:00-04:00 and 06:00-10:00 UTC). Off-peak CNY per 1M tokens: ¥0.02 cache hit, ¥1 cache miss, ¥4 output.
- DeepSeek-V4-Pro retires on **2026-09-14 12:00 Beijing time (04:00 UTC)**. After that, requests to `deepseek-v4-pro` are routed to V4.1 Flash and billed at Flash prices. **Until then, `deepseek-v4-pro` is still billed at the Pro table** (verified off-peak CNY: ¥0.15 cache hit, ¥4.5 cache miss, ¥13.5 output; peak double).

### Confirmed findings on current code (2026-09-10)

1. **The serialized prefix is not byte-stable, and the cause is the first message.** `createSystemMessage()` (`src/contracts/deepseek/Chat.ts:100`) ends the system message with `Current local date and time: <minute-precision timestamp> (<timezone>)`. Because the system message precedes the tool schemas and the entire history, a fresh timestamp invalidates reuse from that offset onward: the first request of every generation re-reads the tool schemas and the full history as cache-miss. Within a tool cycle the message is built once, which is why an 80% hit rate still coexists with ~8.7M daily cache-miss tokens. `src/test/deepseek/SystemPrompt.test.ts:22` pins the current behaviour, so the fix must update that test deliberately rather than by accident.
2. **The auxiliary-model policy is currently unobservable.** Security review sends `model: options.providerConfig.model` and compaction uses `options.config.model`. Since `deepseek-flash` is the only model on the official endpoint, primary and auxiliary resolve to the same model, so substitution cannot produce a measurable saving today. Implement it as policy, verify it once a more capable flagship exists, and keep it inert on custom endpoints.
3. **There is no per-phase cache-hit ratio.** `UsagePicker.tsx` renders per-phase tokens only; the hit ratio is conversation-wide. A prefix regression therefore cannot be detected from the UI, which is precisely what finding 1 requires.
4. **The price catalog was stale and the tier was chosen at display time.** `PRICE_CATALOG_VERSION` was still `1` (`src/shared/usage/UsageModels.ts:6`) despite today's reprice, `UsagePricing.ts` mapped `deepseek-v4-pro` to the Flash tiers although Pro bills at its own table until 2026-09-14 04:00 UTC, `estimateUsageCost`/`refreshUsageCost` defaulted to `at = new Date()` so recomputing a historical aggregate inside the peak window doubled it, and only aggregates flagged `officialEndpoint` were priced at all. Resolved in `0.1.14` (catalog version `2`, tier taken from the request instant stored as `pricedAt`), and superseded by the decision to drop retired names entirely (see todo 6).
5. **Local deterministic compaction is only a fallback.** `selectLocalRanges` and `buildLocalSummary` run on error paths, not as a pre-pass, and `AUXILIARY_MAX_TOKENS = 4_096` is shared by summarization and range selection.
6. **The baseline reference moved.** The previous draft measured savings against draft 020, which no longer exists as a document; its substance ships as the built-in usage telemetry. The baseline is now the usage panel itself, with tier and currency pinned.

## Objective

Reduce recurring cache-miss input and auxiliary-model output while preserving complete tool protocol state, security guarantees, and custom-endpoint compatibility.

## To-Do List

Ordered by measured impact: prefix stability first, then pricing correctness (needed to trust any measurement), then compaction and auxiliary routing.

Update 2026-09-10: items 1-3 and 5-7, 9-10 and 12 shipped in `0.1.14`. What remains is the auxiliary-model policy (inert while a single model exists) and the security-review payload, which belongs to draft 021.

- [x] Make the serialized request prefix byte-stable across rounds when its meaning has not changed: system instructions, tool ordering, schemas, historical messages, and stable runtime capability text.
- [x] Remove or stabilize the minute-precision timestamp in `createSystemMessage()`. Prefer dropping it from the system message and carrying the current date only where it is actually needed (for example the user turn or tool results) over rounding to a value that still changes within a session. Update `SystemPrompt.test.ts` intentionally and confirm relative-date behaviour still works.
- [x] Do not reorder or rewrite prior messages merely for presentation once a tool cycle has started.
- [x] Report cache-hit ratio per phase and flag cache-prefix regressions between consecutive rounds, using the existing telemetry rather than a new pipeline.
- [x] Pin the price tier to the request's own UTC time instead of the time of display or recomputation, and store that tier (or the priced instant) with the aggregate so historical costs are stable when reopened.
- [x] Bump `PRICE_CATALOG_VERSION` for the 2026-09-10 price change and decide explicitly whether older-version aggregates are recomputed or invalidated. A pre-reprice `costUsd` must not be reused as if it were current.
- [x] Resolve `deepseek-v4-pro` billing for the window that ends 2026-09-14 04:00 UTC. Decided to drop retired names instead of modelling them: `normalizeModelId`, the retired-name price aliases, and the separate Pro table were removed, so no retired identifier is accepted, priced, or rewritten. Historical aggregates keep the estimate they were billed with, and a retired or unknown name yields no estimate rather than borrowing current rates. Do not silently price historical Pro usage at Flash rates before the retirement takes effect.
- [ ] Add an explicit auxiliary-model policy: on the official endpoint, allow non-thinking security and compaction work to use the current Flash-class auxiliary model (`deepseek-flash`) even when the primary generation later moves to a more capable model. Preserve the selected model when compatibility or a custom endpoint cannot be proven, and document the switch as inactive while a single model exists.
- [x] Apply local deterministic compaction before a model call: exclude already-covered generations, repeated tool presentation data, unchanged file regions, and inputs that fit without compaction.
- [x] Give summaries and range-selection calls phase-specific output ceilings based on the requested structure instead of the general 4,096-token cap.
- [ ] For security review, send only facts needed for the decision: bounded original intent, normalized command, relevant file excerpts/effect metadata, and workspace-containment facts. Do not add unrelated conversation history. Coordinate with draft 021, which owns the deterministic effect facts and currently feeds the reviewer no operands for PowerShell script invocations.
- [x] Never trade away correctness silently: fall back to the primary model or request explicit user action when the auxiliary model is unavailable or incompatible.

### What shipped in 0.1.14

- `createSystemMessage()` is now a constant, and the current date travels in the newest user turn (`appendCurrentTimeToUserTurn`), so the prefix stays byte-stable across generations. `ToolCallCycle.test.ts` gained a regression test asserting that each round appends to the previous message list instead of rewriting it, and that tool ordering is unchanged.
- The usage panel already rendered a per-phase cache-hit ratio; the same helper now makes a prefix regression visible there.
- Reviewer guidance used to be spliced into `messages[0]` (`withProgressReviewInstruction`, `withCompletionRecoveryInstruction`), so every request after a checkpoint paid a whole-transcript cache miss: each checkpoint re-sent the entire prefix once, which accounts for most of the miss side of the tool rounds. `TurnGuidance.ts` now appends that guidance as the newest message (`createProgressReviewCheckpointMessage`, `createCompletionRecoveryMessage`), where it costs its own ~200 tokens instead of the transcript, and `isTurnGuidanceMessage` keeps `ProgressReviewer` and `CompletionReviewer` from reading agent guidance as the user's request. `ToolCallCycle.test.ts` asserts the prefix stays byte-identical across injected checkpoint rounds and that the system message keeps its original bytes.
- `UsagePricing.ts` prices from DeepSeek's own USD and CNY tables and selects the peak/off-peak tier from the request instant (stored as `pricedAt`). `PRICE_CATALOG_VERSION` is `2`; older aggregates keep the estimate they were billed with. The priced set is exactly the registered model: the retired-name aliases and the Pro table were removed together with `normalizeModelId`.
- `ContextCompaction` now uses per-phase output ceilings (`SUMMARY_MAX_TOKENS` 2,048, `RANGE_SELECTION_MAX_TOKENS` 512) instead of one shared 4,096-token cap.
- Dead code found on the way: the never-read `supportsThinking`, `supportsFIM`, `supportsTools`, `supportsVision` and `known` capability fields were removed from `MODEL_REGISTRY` and the context-budget capability lookup.
- `SYSTEM_PROMPT_COPILOT` now budgets the code comments the model writes: non-obvious intent only, never a restatement of the code, and matching the file's existing density. A generated comment is output paid once and cache-miss-or-hit input paid again on every later round that re-reads the file, so narrated code compounds across a turn. The blocks that exceeded their own code in `MessagesSection.tsx` and `ToolCallCycle.ts` were trimmed to one line as the first examples.

- `read_func` now takes its symbol names, ranges, and kinds from the editor's own language providers instead of a hand-written scanner. The tool workspace host gained a `readDocumentSymbols` capability, `VsCodeToolWorkspace` answers it with `vscode.executeDocumentSymbolProvider`, and a small pure module turns the returned tree into qualified names and signatures. The per-language regex families and the brace/indentation heuristics are gone, so any language the editor can outline works and a file without a symbol provider is told to locate the name with `search_content` and read its lines through a `read_file` range; the structured result also dropped its redundant `language` field. Module-level `const` bindings, which hold most arrow-function exports in TypeScript, resolve too, and an empty answer is believed only after the file has been loaded and the provider has repeated it across a short backoff.

- `read_file` gained `offset` and `limit`, the fallback for the shapes `read_func` cannot reach. `search_content` locates the name and the range read returns only those lines with `startLine`, `endLine`, `totalLines`, `hasMore`, and the whole-file SHA-256, bounded to 600 lines or 48 KiB and refusing a file over 8 MiB, so a method inside an object literal no longer costs a whole-document read. Both `read_func` failure messages name that route, and the chat labels the call as `lines A-B`.

- The reading order is now stated where every instance reads it, not left to the habit of one conversation: `SYSTEM_PROMPT_COPILOT` prefers `read_func` for a named declaration, `search_content` plus a `read_file` range for what the editor cannot name, and a whole-file read only for context spanning declarations, and both tool descriptions repeat it so the preference survives a request that skips the system message. `SystemPrompt.test.ts` asserts the rule, `ReadFile.test.ts` and `ReadFunction.test.ts` assert both descriptions, and the 2,800-character guard forced the prompt to pay for the new rule by tightening wording it already carried (the `timedOut` retry, the prompt-injection sentence, the web-failure sentence, and the terminal sentence) instead of raising the ceiling; the prompt ends at 2,795.

### Remaining work

- Auxiliary-model policy: implement it as policy and verify it once a model more capable than Flash exists; it is inert today because `deepseek-flash` is the only registered model.
- Security-review payload facts: owned by draft 021.
- `src/infrastructure/tools/builtins/fileSystem/CodeSymbols.ts` (the regex scanner that `read_func` used before the editor-provider switch) is now unreferenced and is waiting for an explicit deletion confirmation.

### Acceptance criteria

- [ ] Consecutive tool rounds with unchanged configuration retain a measurable stable cacheable prefix; changing only a tool result does not perturb earlier serialized context or tool ordering.
- [ ] The system message no longer changes within a session, and the relative-date instruction it carries still works.
- [ ] Cache-hit ratio per phase is visible in the usage panel and a prefix regression is detectable from it.
- [ ] Auxiliary calls are itemized and use the configured cost policy without enabling thinking.
- [ ] No compaction call occurs while the exact request already fits the context budget.
- [ ] Already summarized generations are not sent again to the summarizer.
- [ ] Summary and range-selection output ceilings are covered by truncation/invalid-JSON fallbacks.
- [ ] Benchmarks compare cache miss, cache hit, auxiliary output, latency, and total estimated cost against the usage-panel baseline from finding 6, with the price tier and the currency recorded per run. A saving must not be claimed by comparing runs measured in different tiers, since peak is 2x off-peak, and display currency must be stated because USD and CNY are separate official tables.
- [ ] Recomputing a historical aggregate does not change its cost when the recalculation happens outside the billing window of the requests it covers.
- [ ] Custom endpoints receive no unsupported model substitution.

## Dependencies

Draft 017 (stable publication) is blocked on this issue and on 021/023. Draft 023 owns the reasoning and tool-result output ceiling, which overlaps with the per-phase ceilings here; settle the shared constant in one place.
