[Back](INDEX.md)

# Settings, Secrets, and History

## `SettingsManager`

Initializes, normalizes, and atomically writes `~/.yrs-dpsk-copilot/settings.json`. The normalized in-memory copy is authoritative after activation; runtime reads never reload a potentially stale disk value.

It must handle:

- DeepSeek-only defaults.
- normalization of `toolExecutionModes`.
- `maxTokens`, clamped to 1–384,000 with a default of 8,192. This is the requested output allowance, not the 1M-token V4 context window; runtime model capabilities may lower it.
- `maxToolRounds`, clamped to 1–20 with a default checkpoint interval of 6.
- `maxConcurrentGenerations`, clamped to 1–16 with a default of 8.
- ignoring old configuration that no longer applies.
- never persisting `apiKey`.
- serializing writes and publishing a new monotonic revision only after durable persistence succeeds.
- retaining the last confirmed value and revision when persistence fails.
- returning immutable permission snapshots after pending writes settle. Untrusted workspaces receive an effective `default` snapshot with no per-tool auto-approval while the saved global choice remains unchanged.

## `SecretsManager`

Stores the API key with `context.secrets`.

Current credential bundle:

- `yrs-dpsk-copilot.apiCredentials.v2`

Credentials are keyed by normalized API origin. The legacy
`yrs-dpsk-copilot.apiKey` value is migrated atomically to the current origin and
then removed. Changing origins requires native confirmation and does not copy a
credential to the new destination. Resetting settings preserves every stored
origin credential; deleting a credential removes only the active origin.

The webview receives only `configured` or `missing` state plus a masked preview
for the input placeholder. The secret is not part of `WebviewConfig`.

Rule: never write an API key to logs, history, settings, checkpoints, webview
configuration, or visible messages. API requests and redirects must remain on
the normalized origin selected for that credential.

## `HistoryManager`

Stores a validated schema-v2 manifest per conversation under `~/.yrs-dpsk-copilot/history/`. Small conversations remain compatible monolithic JSON; large message collections are migrated lazily and atomically into internal segments of at most 4 MiB.

It should support:

- listing history.
- loading a conversation.
- deleting a conversation.
- serializing mutations per conversation.
- persisting completed, interrupted, and error generation outcomes with their `generationId`.
- atomically migrating structurally valid unversioned conversations during the issue #61 compatibility window, while isolating malformed files.
- assigning deterministic `generationId` values to historical turns and terminal `generationStatus` values to historical assistant and error messages.
- storing complete canonical DeepSeek transcripts host-side for new tool-enabled generations while exposing only presentation messages to the webview.
- storing an internal context summary with the atomic generation IDs it replaces; legacy conversations remain replayable as visible user/assistant text without inventing tool protocol.
- persisting schema-2 compaction boundaries and never reintroducing covered generations into provider context.
- enforcing a 256 MiB total quota and applying retention only to inactive conversations; the active conversation is never silently deleted.

Legacy compatibility has no date-based runtime cutoff. It remains active until the cleanup tracked by issue draft 019 is released.

History should avoid storing temporary data that can be rebuilt from the UI.

When `historyEnabled` is false the product enters **Incognito mode**. Existing
history files remain untouched, but reads and writes are unavailable. New turns
stay in an explicitly incognito `ConversationState` and can reach history only
through the confirmed "Save and leave" transition. Enabling history by itself
must never promote an incognito session.

## `GenerationCheckpointStore`

Stores one atomic checkpoint per conversation under `~/.yrs-dpsk-copilot/generation-checkpoints/`.

- Streaming checkpoints are coalesced to at most one write every 500 ms; queue and tool-state transitions are saved immediately.
- Checkpoints contain partial content, timeline, tool states, the canonical transcript accumulated so far, queued prompts, recoverable cancelled drafts, non-secret configuration, the immutable `workspaceBinding`, the active permission-round snapshot, and a monotonic revision. External context snapshots are never checkpointed.
- API keys are never checkpointed.
- Schema-3 checkpoints distinguish queued prompts from cancelled drafts. Compaction boundaries remain in conversation history instead of being duplicated in checkpoints; schema-1 and schema-2 checkpoints remain readable.
- A serialized checkpoint is limited to 16 MiB. Oversized state is rebuilt as a compact snapshot; if even the minimum recoverable state does not fit, persistence fails visibly instead of reporting a false save.
- Activation preserves a checkpoint already marked complete with its valid transcript. Partial work becomes an interrupted history turn, unfinished tools become `cancelled`, and queued prompts return as user-selectable drafts.
- Invalid checkpoints are isolated under `generation-checkpoints/corrupt/`.
- Completing or deleting a conversation removes its checkpoint.
- Incognito mode invalidates pending checkpoint writes, clears live checkpoint
  files, and disables generation, queue, recovery, and shutdown checkpointing.

[Back](INDEX.md)
