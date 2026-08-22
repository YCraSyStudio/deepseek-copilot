[Back](INDEX.md)

# Settings, Secrets, and History

## Settings

`src/platform/vscode/storage/SettingsManager.ts` atomically stores normalized settings in `~/.yrs-dpsk-copilot/settings.json`. Runtime reads use the confirmed in-memory revision.

Current defaults and limits:

- models: `deepseek-v4-flash-vision-exp` (default) and `deepseek-v4-pro`.
- permission modes: `default`, `auto-approve`, and `full-access` only.
- Web search: enabled by default and represented by one capability toggle.
- output allowance: 8,192 tokens, clamped to 1–384,000.
- default-mode tool checkpoint: 6 rounds, clamped to 1–20.
- concurrent generations: 8, clamped to 1–16.
- history retention: 30 days by default.

API keys are never part of settings.

## Secrets

`SecretsManager` stores credentials per normalized API origin in VS Code Secret Storage. The webview receives only configured/missing state and a masked placeholder. Keys must never enter settings, history, checkpoints, diagnostics, URLs, logs, or visible errors. Redirects must preserve the selected credential origin.

## Conversation history

`HistoryManager` stores one validated schema-v2 conversation per JSON manifest under `~/.yrs-dpsk-copilot/history/`; large message sets use bounded internal segments. Conversations include immutable workspace binding, generation ownership, terminal status, timeline, tool presentation, and image attachment metadata.

Terminal generation statuses are `completed`, `cancelled`, `interrupted`, and `error`. Explicit Stop persists a `cancelled` turn with its user message, partial assistant timeline, and completed tool results. Only complete provider protocol sequences are eligible for future replay.

History is limited by retention and quota, excludes the active conversation from silent cleanup, and isolates malformed files. Disabling history enters Incognito mode: active data stays in memory and reaches history only through an explicit save transition.

## Image attachments

- Image metadata stores the DeepSeek `fileId`, media type, byte size, origin, upload and expiry times, API origin, and local cache filename.
- Raw Base64 is never persisted. Clipboard Base64 is only a bounded transient protocol payload.
- Preview bytes live under the extension's `globalStorage/image-attachments` area, not in the conversation JSON.
- Picker uploads allow up to eight JPEG, PNG, GIF, or WebP images per message and 64 MiB per image. Clipboard IPC is limited to 16 MiB per image.
- Uploads use DeepSeek Files API `purpose=user_data` with a 30-day expiry.
- Removing a draft attachment attempts remote deletion and clears its preview cache.
- Conversation deletion defers attachment cleanup until the Undo window closes. Undo therefore restores both the conversation and its image previews.

## Generation checkpoints

`GenerationCheckpointStore` keeps one atomic schema-3 checkpoint per conversation under `~/.yrs-dpsk-copilot/generation-checkpoints/`.

- Streaming writes are coalesced; queue and tool transitions persist immediately.
- Checkpoints contain partial presentation state, canonical transcript, queued prompts, image metadata, non-secret configuration, workspace binding, permission snapshot, and a monotonic revision.
- A checkpoint is limited to 16 MiB and is compacted before failing visibly.
- Host shutdown restores partial work as `interrupted`, unfinished tools as `cancelled`, and queued prompts as recoverable drafts.
- Explicit user cancellation is a persisted conversation outcome, not a recoverable cancelled draft.
- Completing or deleting a conversation removes its checkpoint; malformed records are isolated.

[Back](INDEX.md)
