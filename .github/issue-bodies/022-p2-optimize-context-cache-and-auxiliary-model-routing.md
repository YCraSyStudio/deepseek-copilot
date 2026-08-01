## Context

Every tool round resends the conversation and tool schemas. DeepSeek can discount matching input prefixes, but cache reuse is best-effort and requires stable prefixes. Separately, security review and context compaction currently use the conversation's selected model even though they disable thinking and perform small structured tasks.

Compaction can also reserve a broad 4,096-token auxiliary output for summaries/range selection and may send more source material than a deterministic first pass needs.

## Objective

Reduce recurring cache-miss input and auxiliary-model output while preserving complete tool protocol state, security guarantees, and custom-endpoint compatibility.

## To-Do List

- [ ] Complete issue draft 020 first so savings can be measured.
- [ ] Audit the serialized request prefix and keep system instructions, tool ordering, schemas, historical messages, and stable runtime capability text byte-for-byte deterministic across rounds when their meaning has not changed.
- [ ] Do not reorder or rewrite prior messages merely for presentation once a tool cycle has started.
- [ ] Use the usage telemetry from 020 to detect cache-prefix regressions and report cache-hit ratios per phase.
- [ ] Add an explicit auxiliary-model policy. On the official DeepSeek endpoint, allow non-thinking security and compaction work to use `deepseek-v4-flash` even when the primary generation uses Pro; preserve the selected model when compatibility or a custom endpoint cannot be proven.
- [ ] Apply local deterministic compaction before a model call: exclude already-covered generations, repeated tool presentation data, unchanged file regions, and inputs that fit without compaction.
- [ ] Give summaries and range-selection calls phase-specific output ceilings based on the requested structure instead of the general 4,096-token cap.
- [ ] For security review, send only facts needed for the decision: bounded original intent, normalized command, relevant file excerpts/effect metadata, and workspace-containment facts. Do not add unrelated conversation history.
- [ ] Never trade away correctness silently: fall back to the primary model or request explicit user action when the auxiliary model is unavailable or incompatible.

- [ ] Consecutive tool rounds with unchanged configuration retain a measurable stable cacheable prefix.
- [ ] Changing only a tool result does not perturb earlier serialized context or tool ordering.
- [ ] Auxiliary calls are itemized and use the configured cost policy without enabling thinking.
- [ ] No compaction call occurs while the exact request already fits the context budget.
- [ ] Already summarized generations are not sent again to the summarizer.
- [ ] Summary and range-selection output ceilings are covered by truncation/invalid-JSON fallbacks.
- [ ] Benchmarks compare cache miss, cache hit, auxiliary output, latency, and total estimated cost against the baseline from 020.
- [ ] Custom endpoints receive no unsupported model substitution.
