> Priority: **P2 — release hardening**

## Context

`Logger.ts` intentionally discards all warnings and errors. The extension calls these functions throughout settings, history, webview validation, streaming, and tool execution, but production failures currently leave no usable diagnostic trail.

Console logging is not an acceptable replacement because it can interact badly with extension-host shutdown and can accidentally expose prompts, workspace content, or API credentials.

Relevant code:

- `src/shared/logging/Logger.ts`
- callers of `logWarning` and `logError` under `src/`

## Objective

Provide bounded, user-controlled diagnostics that are useful for support while redacting secrets and private content by default.

## To-Do List

- [ ] Implement a managed VS Code `OutputChannel` with explicit lifecycle disposal.
- [ ] Add log levels and keep normal operation quiet by default.
- [ ] Centralize redaction for API keys, authorization headers, user identifiers, URLs with credentials, and secret-like values.
- [ ] Avoid logging prompt text, file contents, tool output, reasoning, or full paths by default.
- [ ] Add correlation IDs for generation, conversation, tool call, and request without exposing content.
- [ ] Bound in-memory/on-disk diagnostic retention.
- [ ] Add a command to show diagnostics and optionally copy a sanitized support report.
- [ ] Include extension/VS Code/OS versions, active model ID, permission mode, and feature flags in sanitized metadata.
- [ ] Replace remaining direct `console.*` calls with the managed logger or visible UI feedback.
- [ ] Document exactly what diagnostics contain and how users can clear them.

## Acceptance Criteria

- [ ] Production failures produce actionable, correlated diagnostics.
- [ ] API keys and authorization values are never present in logger output.
- [ ] Workspace/prompt content is omitted unless a future explicit opt-in policy is implemented.
- [ ] Logger creation and disposal are safe during extension reload/shutdown.
- [ ] Users can inspect and clear all retained diagnostic data.

## Regression Tests

- [ ] Redaction tests for keys, headers, URLs, stack traces, and nested structured errors.
- [ ] Lifecycle tests for repeated activation/disposal.
- [ ] Bounded-retention tests under high event volume.
- [ ] Sanitized support-report snapshot tests.
