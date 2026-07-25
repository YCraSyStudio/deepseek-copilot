[Back](INDEX.md)

# Settings, Secrets, and History

## `SettingsManager`

Reads, normalizes, and atomically writes `~/.yrs-dpsk-copilot/settings.json`.

It must handle:

- DeepSeek-only defaults.
- normalization of `toolExecutionModes`.
- `maxConcurrentGenerations`, clamped to 1–16 with a default of 8.
- ignoring old configuration that no longer applies.
- never persisting `apiKey`.

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

Legacy compatibility has no date-based runtime cutoff. It remains active until the cleanup tracked by issue draft 019 is released.

History should avoid storing temporary data that can be rebuilt from the UI.

## `GenerationCheckpointStore`

Stores one atomic checkpoint per conversation under `~/.yrs-dpsk-copilot/generation-checkpoints/`.

- Streaming checkpoints are coalesced to at most one write every 500 ms; queue and tool-state transitions are saved immediately.
- Checkpoints contain partial content, timeline, tool states, queued prompts, non-secret configuration, workspace URI, and a monotonic revision.
- API keys are never checkpointed.
- Activation converts partial work into an interrupted history turn, changes unfinished tools to `cancelled`, restores queued prompts as user-selectable drafts, and removes the consumed checkpoint.
- Invalid checkpoints are isolated under `generation-checkpoints/corrupt/`.
- Completing or deleting a conversation removes its checkpoint.

[Back](INDEX.md)
