[Back](INDEX.md)

# State and Messaging

## Channel

The UI uses `src/ui/VsCodeApi.ts` and `postMessage`.

## Relevant hooks

- `useMessageHandler`: processes messages from the backend.
- `useStreamHandler`: accumulates chunks and reasoning, then renders text progressively so transport chunk boundaries are not exposed directly to the user.
- `useChatConfig`: loads and maintains configuration.
- `useToolCallController`: coordinates approvals and results for the owning `generationId`.
- `FileSelector`: renders revision-bound path autocomplete suggestions only for `./`; `../` never opens the selector.

## Rules

- Do not access the filesystem directly from React.
- Do not store API keys in localStorage.
- Avoid duplicating contracts outside `src/adapters/messages/Webview.ts`.
- Backend errors should be shown without blocking the whole UI.
- Local state should be rebuildable from `configLoaded`, `history`, `conversationLoaded`, and `generationSnapshot`.
- Chat state remains mounted while switching between Chat, History, and Settings so pending generation and tool confirmations are not lost.
- Stream and tool events are accepted only for the active `generationId`; events from background or superseded runs must not mutate the selected chat.
- Cancelling preserves the user message and partial assistant output as an interrupted turn.
- Queued prompts recovered after shutdown are offered as drafts and removed from the checkpoint recovery list only when consumed.

[Back](INDEX.md)
