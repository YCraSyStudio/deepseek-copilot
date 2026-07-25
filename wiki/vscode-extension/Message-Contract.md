[Back](INDEX.md)

# Message Contract

The shared contract lives in `src/adapters/messages/Webview.ts`. The UI must not call backend internal APIs; it only sends messages through `postMessage`.

## Incoming from webview

- `sendMessage`: enqueues a prompt with a unique `clientRequestId`, conversation, context, and referenced files.
- `steerGeneration`: queues guidance at the front and interrupts the named generation.
- `cancelGeneration`: cancels the named `generationId`.
- `getGenerationSnapshot`: requests active runs, queues, and recovered drafts after webview mount.
- `consumeRecoveredDraft`: removes one restored queued prompt after the UI adopts it.
- `getConfig`: requests configuration and API key state.
- `saveConfig`: saves settings and API key.
- `resetConfig`: restores defaults.
- `testConnection`: validates DeepSeek connectivity.
- `getHistory`: lists saved conversations.
- `loadConversation`: loads a conversation by id.
- `deleteConversation`: deletes a conversation.
- `executeToolCall`: approves, executes, or rejects a pending tool call owned by a named generation.
- `toolCallLimitDecision`: continues or stops the named generation after its tool-round limit.
- `getPathCompletions`: returns workspace path suggestions for chat input autocomplete.
- `getAvailableTools`: gets tool metadata.
- `openFile`: opens a file in VS Code.
- `newConversation`: clears the current chat state.

## Outgoing to webview

- `generationAccepted`: maps `clientRequestId` to the started `generationId` and conversation.
- `messageQueued`: reports the per-conversation queue position.
- `generationSnapshot`: rebuilds active generation state and exposes recovered drafts.
- `streamTimelineDelta`: incremental content or reasoning.
- `streamTimelineToolGroup`: chronological tool-call group.
- `streamDone`: successful generation end.
- `streamError`: UI-visible error.
- `configLoaded`: loaded configuration.
- `configSaved`: save confirmation.
- `history`: conversation list.
- `conversationLoaded`: recovered conversation.
- `toolCallStarted`: tool call started.
- `toolCallResult`: tool result.
- `toolCallConfirmationRequired`: requires human approval.
- `pathCompletions`: workspace path completion response.
- `availableTools`: available tool metadata.

Generation-specific outgoing stream and tool messages carry `generationId` and `conversationId`. The UI must ignore events that do not belong to the selected active generation.

## Conversation schema

New conversations are written with `schemaVersion: 2`. User and assistant messages carry `generationId`; assistant and error messages may carry a terminal `generationStatus` of `completed`, `interrupted`, or `error`. Activation atomically upgrades valid unversioned and partially migrated conversations as described in [Migration Status](../maintenance/Migration-Status.md). Compatibility has no date-based runtime cutoff.

## Compatibility

Historical naming such as `provider` may remain in internal names or messages, but product configuration must stay DeepSeek-only and must not expose an Ollama selector.

[Back](INDEX.md)
