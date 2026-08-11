# Change Log

## [0.1.9] - 2026-08-11

- Publish Marketplace builds through its normal release channel while retaining the extension's `preview: true` product status, and mark GitHub releases as prereleases.
- Start a new chat automatically when restored conversation state belongs to another VS Code workspace or window.
- Isolated concurrent chat generations with protocol-v3 conversation/generation correlation, navigation request IDs, background activity status, and snapshot-based restoration when returning to a running chat.
- Changed explicit **Stop** to atomically remove the complete cancelled turn from UI and persisted context and restore its prompt as a per-conversation draft; steering and lifecycle interruptions retain their distinct recovery behavior.
- Centralized terminal generation ownership so each run emits exactly one completion or error, added `cancelling`/`cancelled` states and typed stop reasons, and made repeated or stale cancellation idempotent.
- Propagated cancellation through context discovery, project instructions, compaction, provider streaming, browser work, confirmations, mutation locks, tools, and descendant processes.
- Removed tool-round checkpoints and per-block tool-call budgets from `auto-approve` and `full-access`; the configured limit now applies only to default, read-only, and custom modes.
- Reworked automatic context compaction around calibrated generation budgets, with a valid `starting -> compacting -> streaming` lifecycle and safe rollover after closed tool rounds even when usage jumps directly to the hard limit.
- Compaction now consumes its quota and emits one localized, persisted marker only when it actually reduces the request; provider-reported prompt usage calibrates primary, auxiliary, and tool-request estimates.
- Centralized Unicode-safe UTF-8 text bounding, merged overlapping file ranges, bounded large references and summaries, and persisted only newly covered generation IDs per compaction boundary to avoid quadratic history growth.
- Added preventive output-overflow recovery for reasoning-heavy responses while keeping incomplete completion states visible, and removed redundant budget events and checkpoint fields without breaking schema 1 or 2 recovery.
- Added regression coverage for initial compaction, cancellation, calibrated hard limits, tool-cycle rollover, compaction quotas, Unicode byte boundaries, range normalization, incremental markers, legacy checkpoints, and extension-host state transitions.

## [0.1.8] - 2026-08-08

- Replaced provider URL requests and automatic fallback with human-style headless navigation on the selected Bing, Google, or Baidu home page. Bing is the default; CAPTCHA, blocking, and timeout failures are terminal and never open a visible browser or retry automatically.
- Search now returns at most ten normalized organic HTTPS URL strings. `read_web` accepts an exact URL registered to its `search_id`, while direct URLs remain restricted to addresses explicitly supplied by the user.
- Rebuilt page extraction around `document.body`: hidden and active elements are removed, headings and adjacent paragraphs are grouped into stable numbered sections, oversized sections split between paragraphs, and pagination uses opaque cursors without renumbering content.
- Added a fresh cryptographic 128-bit nonce to every web read, JSON-safe untrusted-content boundaries, prompt-injection reminders before and after page data, collision regeneration, and informative injection-risk detection.
- Added dedicated API and Web search Settings tabs, migrated and removed obsolete native web-search settings, and removed the visible-browser and configurable usage-warning flows. The isolated HTTPS proxy, DNS pinning, SSRF protection, session profile cleanup, serialized browsing, and resource limits remain enforced.

## [0.1.7] - 2026-08-07

- Replaced VS Code's integrated-browser tools with an isolated `puppeteer-core` runtime that reuses compatible Edge or Chrome installations and offers a pinned, extension-managed Chromium Headless Shell fallback.
- Added an ephemeral HTTPS-only proxy with DNS pinning, public-address validation, SSRF and rebinding protection, registrable-domain concessions, request/transfer/concurrency limits, and sanitized aggregate diagnostics.
- Added localized DuckDuckGo, Bing, Google, and Yahoo fallback; organic-result parsing; compact 8 KiB responses; semantic active-content-free extraction; prompt-injection markers; and generation-scoped in-memory caches.
- Added web-tainted generation tracking: workspace mutations receive a content-free automatic safety review, while network, credential, publication, remote, external, or ambiguous effects require manual confirmation.
- Replaced model-visible page IDs, DOM references, arbitrary navigation, and generic link following with opaque search/document IDs and only two constrained tools: `search_web` and the multi-mode `read_web`.
- Compact completed conversation context to user/final-answer pairs, retain full provider transcripts only for active or incomplete recovery, and lazily compact duplicate legacy web output when history is saved again.

## [0.1.6] - 2026-08-04

- Added provider-reported token and cache observability: every attempted request is counted exactly once, valid usage is attributed to `primary`, `tool_round`, `security_review`, `context_summary`, or `file_compaction`, and redacted totals are available per generation and conversation. Missing fields remain unavailable instead of becoming zero. Official DeepSeek V4 Flash/Pro costs use a persisted versioned USD catalog; custom endpoints never receive guessed prices. Optional local breakdowns, auxiliary-call/cache-miss/output/cost warnings, and redacted generation and conversation diagnostics were added.
- Added Incognito mode as the privacy boundary for disabled history: active work requires confirmation, chat and referenced content stay out of history, checkpoints, and webview persistence, and leaving the mode requires an explicit save-or-discard decision.
- Hardened production behavior across tool-call integrity, unsaved editor buffers, concurrent JSON storage, partial SSE streams, process-tree shutdown, protocol negotiation, official DeepSeek model validation, managed diagnostics, and removal of legacy conversation migration.
- Added production CI and packaged-VSIX gates, deterministic release artifacts and checksums, package-content assertions, recursive unit coverage, and extension-host smoke tests.

## [0.1.5] - 2026-07-30

- Packaging hotfix: excluded `*.log` files from VSIX artifacts.

## [0.1.4] - 2026-07-30

- Protected DeepSeek credentials per API origin in VS Code Secret Storage, including automatic migration of the legacy key, explicit confirmation before changing credential destinations, same-origin redirect enforcement, redacted errors, and a masked placeholder preview that never places the stored key in webview configuration.
- Added a two-stage `auto-approve` command gate: conservative local analysis runs first, uncertain workspace-contained commands receive a bounded DeepSeek security review with the original user request and safe read-only file context, and genuine ambiguity falls back to manual confirmation.
- Added reviewer outcomes for automatic approval, safe replanning, and manual confirmation with confidence levels from `very_low` through `very_high`; automatic decisions require at least `medium_high`, while credentials, elevation, external mutation, broad process termination, and destructive operations remain non-delegable.
- Grouped adjacent reasoning and tool calls into compact expandable Activity panels, hid successful `read_file` contents from Chat, and replaced generic copy actions on file tools with `Open file` and `View change`.
- Added native per-tool change diffs reconstructed from the recorded operation, so a completed create, edit, or patch can be reviewed independently from later working-tree changes.
- Reworked confirmation panels, Settings, tool controls, and the chat composer for narrow and wide sidebars; the API-key preview now appears correctly on first open.
- Reorganized contracts, built-in tools, command review, chat orchestration, VS Code workspace adapters, Settings, Chat UI, and tests by domain while preserving public messages, tool names, stored configuration, and history compatibility.
- Added enforced architecture boundaries, recursive unit-test discovery, dedicated integration tests, and coverage for credential redaction, API origins, command review, activity grouping, and file-tool presentation.

## [0.1.3] - 2026-07-27
- Improved history storage with automatic legacy-conversation migration during the compatibility period tracked by [issue #61](https://github.com/YarCrasy/deepseek-copilot/issues/61).
- Added concurrent generations across conversations, per-conversation queues, targeted interruption, and atomic checkpoint recovery after restart.
- Bound conversations and tool execution to immutable logical workspaces, with safe multi-root paths, external read-only attachments, and hardened content search.
- Redesigned permissions around `default`, `read-only`, `auto-approve`, `full-access`, and editable `custom` profiles, with revisioned host-authoritative updates.
- Hardened terminal and filesystem execution with workspace containment, external-access confirmation, shell-aware danger analysis, and serialized mutations.
- Auto context compacting in large chat sessions.
- Turned the tool-round limit into a checkpoint where unattended modes ask DeepSeek whether to continue, request instructions, or stop.
- Improved css designs making the extension more responsive.

## [0.1.2] - 2026-07-23

- Added the opt-in `auto-approve` permission mode, which delegates approval to DeepSeek for all non-disabled tools while retaining schemas and workspace path validation.
- Reorganized settings into a clearer General section and improved the English, Spanish, and Chinese interface translations.
- Added an explicit confirmation before continuing when a conversation reaches the tool-call round limit.
- Fixed pending tool confirmations remaining visible after cancellation.
- Fixed active conversation identity being lost when history was updated.
- Aligned the maximum output-token setting with DeepSeek's 384K-token limit.
- Added an in-repository technical wiki covering architecture, tools, storage, the DeepSeek API, testing, and maintenance.

## [0.1.1] - 2026-07-17

- Replaced text markers with a native chronological timeline for reasoning, content, and tool groups.
- Unified tool states and fixed rejection, cancellation, host acknowledgement, duplicate calls, stale pending calls, and maximum-round termination.
- Added structured non-interactive terminal results, bounded output, process-tree cancellation, and platform-aware danger analysis.
- Hardened DeepSeek SSE parsing, response validation, URL handling, timeouts, and bounded retries.
- Added multi-root conversation association, bounded context, staged Git context, binary detection, delimited references, `AGENTS.md` limits, and optimistic file hashes.
- Moved settings and per-conversation history to `~/.yrs-dpsk-copilot/` with atomic writes, validation, retention, quotas, corruption isolation, pagination, bulk deletion, and Undo.
- Completed the accessible chat, confirmation, settings, and history flows; added English, Spanish, and Chinese webview localization.
- Fixed history deletion and new-chat state synchronization, including clearing Chat view when the active conversation is removed.
- Updated the extension and documentation icons to the purple and green preview palette.
- Fixed the Windows integration-test runner and verified activation against VS Code 1.129.0.

## [0.1.0] - 2026-07-12

- Initial preview release for the VS Code Marketplace.
