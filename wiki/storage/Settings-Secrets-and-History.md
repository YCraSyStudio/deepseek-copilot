[Back](INDEX.md)

# Settings, Secrets, and History

## `SettingsManager`

Initializes, normalizes, and atomically writes `~/.yrs-dpsk-copilot/settings.json`. The normalized in-memory copy is authoritative after activation; runtime reads never reload a potentially stale disk value.

It must handle:

- DeepSeek-only defaults.
- normalization of `toolExecutionModes`.
- `maxConcurrentGenerations`, clamped to 1–16 with a default of 8.
- ignoring old configuration that no longer applies.
- never persisting `apiKey`.
- serializing writes and publishing a new monotonic revision only after durable persistence succeeds.
- retaining the last confirmed value and revision when persistence fails.
- returning immutable permission snapshots after pending writes settle. Untrusted workspaces receive an effective `read-only` snapshot with no per-tool auto-approval while the saved global choice remains unchanged.

## `SecretsManager`

Stores the API key with `context.secrets`.

Current key:

- `yrs-dpsk-copilot.apiKey`

Rule: never write the API key to logs, history, settings, or visible messages.

## `HistoryManager`

Stores one validated schema-v2 JSON file per conversation under `~/.yrs-dpsk-copilot/history/`.

It should support:

- listing history.
- loading a conversation.
- deleting a conversation.
- serializing mutations per conversation.
- persisting completed, interrupted, and error generation outcomes with their `generationId`.
- atomically migrating valid unversioned files, partially migrated schema-v2 files, and legacy `workspaceState` envelopes to complete schema v2.
- assigning deterministic `generationId` values to historical turns and terminal `generationStatus` values to historical assistant and error messages.
- storing complete canonical DeepSeek transcripts host-side for new tool-enabled generations while exposing only presentation messages to the webview.
- storing an internal context summary with the atomic generation IDs it replaces; legacy conversations remain replayable as visible user/assistant text without inventing tool protocol.

Legacy compatibility has no date-based runtime cutoff. It remains active until the cleanup tracked by issue draft 019 is released.

History should avoid storing temporary data that can be rebuilt from the UI.

## `GenerationCheckpointStore`

Stores one atomic checkpoint per conversation under `~/.yrs-dpsk-copilot/generation-checkpoints/`.

- Streaming checkpoints are coalesced to at most one write every 500 ms; queue and tool-state transitions are saved immediately.
- Checkpoints contain partial content, timeline, tool states, the canonical transcript accumulated so far, queued prompts, non-secret configuration, the immutable `workspaceBinding`, the active permission-round snapshot, and a monotonic revision. External context snapshots are never checkpointed.
- API keys are never checkpointed.
- Activation preserves a checkpoint already marked complete with its valid transcript. Partial work becomes an interrupted history turn, unfinished tools become `cancelled`, and queued prompts return as user-selectable drafts.
- Invalid checkpoints are isolated under `generation-checkpoints/corrupt/`.
- Completing or deleting a conversation removes its checkpoint.

[Back](INDEX.md)
