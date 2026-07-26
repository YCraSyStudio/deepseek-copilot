# Change Log

## [0.1.3-unreleased]

- **Added the legacy-history migration period: activation atomically upgrades valid unversioned and partially migrated conversations. Compatibility has no automatic date cutoff and remains available until the scheduled cleanup tracked by [issue #61](https://github.com/YarCrasy/deepseek-copilot/issues/61), currently targeted for 2026-08-25.**

- Added isolated concurrent generations across conversations, configurable from 1 to 16 with a default of 8, while keeping one active generation per conversation.
- Added per-conversation FIFO queues, targeted Stop and Interrupt and guide actions, and generation-bound stream, tool, and confirmation events.
- Added atomic generation checkpoints, coordinated extension shutdown, interrupted partial-response recovery, cancelled unfinished tools, and recoverable drafts for queued prompts after restart.
- Added conversation schema v2 with deterministic generation ownership and terminal `completed`, `interrupted`, or `error` outcomes.
- Bound every conversation and generation to an immutable logical workspace, with deterministic multi-root aliases, revision checks, disconnected-history reassignment, and no active-editor or first-root fallback.
- Restricted path autocomplete and tools to `./` workspace paths, rejecting `../`, absolute paths, URIs, and symlink or junction escapes; terminal defaults to the captured editor root.
- Added native context-file attachment. Explicitly selected external files are bounded, non-persistent read-only snapshots and never grant tool access outside the workspace.
- Isolated tool sessions per generation and serialized mutating tools per workspace while allowing concurrent read-only operations.
- Secured workspace content search with literal matching, sensitive-path filtering, traversal protection, file and output limits, cancellation, and timeouts.
- Updated the English, Spanish, and Chinese web documentation, generated static site, and technical wiki for the new generation, recovery, and migration flows.
- Hardened terminal execution with shell-specific read-only allowlists, workspace-contained path checks, mandatory confirmation for unknown syntax even under global auto-approve, and conversation/workspace/configuration-scoped trust.
- Made global permission updates host-authoritative and revisioned, with durable rollback, stale-acknowledgement protection, Restricted Mode enforcement, and immutable permission snapshots at reasoning/tool-round boundaries.
- Preserved protocol-valid DeepSeek tool transcripts independently from the visible timeline, including hidden reasoning, exact tool-call ordering, valid JSON arguments, checkpoints, and safe replay after reload.
- Replaced field-level history truncation with a total request budget that counts prompts, tool schemas, history, references, output allowance, and safety margin; older atomic generations are summarized and oversized files are reduced to literal model-selected line ranges with a deterministic local fallback.

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
