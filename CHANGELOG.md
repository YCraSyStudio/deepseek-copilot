# Change Log

## [Unreleased]

- Reworked integrated-browser search around one reusable VS Code page: searches type into the active engine, registered results open by click, navigation returns through browser history, and a compatibility mode remains available when newer browser tools are missing.
- Added localized DuckDuckGo, Bing, Google, and Yahoo fallback; semantic organic-result parsing; Bing redirect decoding; public-HTTPS validation; bounded search/document caches; compact 8 KiB responses; semantic page extraction; and sanitized browser diagnostics.
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
