## Context

The generation executor currently forces `thinkingMode: true` for every tool-capable run, even when the user selected reasoning off. This silently changes the requested cost profile.

Terminal execution also retains up to 1 MiB independently for stdout and stderr by default. Large build/test output is then stored in the provider transcript and resent in later tool rounds, potentially dominating input tokens and reducing cache usefulness.

## Objective

Honor the user's reasoning selection and place truthful, measured bounds on model-facing tool results without hiding failures or detailed local diagnostics.

## To-Do List

- [ ] Complete issue draft 020 first so cost regressions are observable.
- [ ] Preserve the user's thinking-mode choice for tool rounds; tools are supported in both thinking and non-thinking modes.
- [ ] Never upgrade reasoning effort or enable hidden reasoning solely because tools are present.
- [ ] Define phase-specific output ceilings for planning/tool rounds and the final answer while treating the user's maximum as an upper bound.
- [ ] Reduce the default model-facing terminal-result allowance to a measured, conservative bound.
- [ ] Keep a bounded local artifact or diagnostic view for additional output when needed, while sending DeepSeek a structured summary with exit code, truncation state, and relevant head/tail/error sections.
- [ ] Add tool-specific compaction for repetitive compiler, package-manager, and test-runner logs. Preserve exact failing diagnostics and never summarize a non-zero exit as success.
- [ ] Cap file/search/tool results by estimated tokens as well as bytes and prevent cumulative results from exhausting the active tool-cycle budget.
- [ ] Detect semantically redundant verification requests after an authoritative successful result and return a compact local result rather than starting another expensive verification round, unless the user explicitly requested it or state changed.
- [ ] Keep full sensitive command output out of persistent telemetry and respect incognito lifecycle rules.

- [ ] With reasoning off, every primary and tool-round request has thinking disabled and no reasoning effort override.
- [ ] With reasoning enabled, the selected effort is preserved rather than upgraded implicitly.
- [ ] A build producing multi-megabyte output cannot inject multi-megabyte tool content into the next provider request.
- [ ] Truncated success and failure results expose truthful exit status and a way for the agent/user to inspect a narrower omitted section.
- [ ] Important diagnostics at both the beginning and end of output survive compaction.
- [ ] Repeated tool rounds remain under a configured cumulative result-token budget.
- [ ] Tests cover stdout/stderr limits, multibyte text, compiler errors, test summaries, cancellation, and transcript recovery.
- [ ] Usage tests demonstrate reduced output and cache-miss input without increasing failed task completion.
