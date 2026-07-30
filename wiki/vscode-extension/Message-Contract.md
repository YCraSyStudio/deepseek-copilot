[Back](INDEX.md)

# Message Contract

The shared contract is split into `WebviewModels.ts`, `WebviewRequests.ts`, and
`WebviewEvents.ts`. `Webview.ts` remains the stable compatibility barrel. The UI
must not call backend internal APIs; it only sends messages through `postMessage`.

## Incoming from webview

- `sendMessage`: enqueues a prompt with a unique `clientRequestId`, conversation, referenced files, and the workspace revision displayed by the UI.
- `steerGeneration`: queues guidance at the front and interrupts the named generation.
- `cancelGeneration`: cancels the named `generationId`.
- `getGenerationSnapshot`: requests active runs, queues, and recovered drafts after webview mount.
- `consumeRecoveredDraft`: removes one restored queued prompt after the UI adopts it.
- `getConfig`: requests configuration and API key state.
- `saveConfig`: saves settings and API key transactionally and carries a unique `requestId`.
- `resetConfig`: restores defaults transactionally and carries a unique `requestId`.
- `testConnection`: validates DeepSeek connectivity.
- `getHistory`: lists saved conversations.
- `loadConversation`: loads a conversation by id.
- `deleteConversation`: deletes a conversation.
- `executeToolCall`: approves, executes, or rejects a pending tool call owned by a named generation.
- `toolCallLimitDecision`: continues or stops the named generation after a tool-round checkpoint in attended modes. Auto-approve and full-access resolve the checkpoint host-side by asking DeepSeek to reassess, so they do not display this prompt.
- `getWorkspaceContext`: resolves the conversation binding and its connected, disconnected, changed, or empty state.
- `rebindConversationWorkspace`: confirms and reassigns an existing conversation to the current logical workspace.
- `openConversationWorkspace`: opens the stored folder or `.code-workspace` in another window.
- `selectContextFiles`: opens the native picker and returns bounded context snapshots.
- `getPathCompletions`: returns `./` path suggestions for a conversation binding and revision.
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
- `configLoaded`: loaded authoritative configuration plus its monotonic revision.
- `configUpdateResult`: save/reset acknowledgement with request ID, revision, normalized authoritative configuration, operation, and `success`, `error`, or `cancelled` status.
- `history`: conversation list.
- `conversationLoaded`: recovered conversation.
- `toolCallStarted`: tool call started.
- `toolCallResult`: tool result.
- `toolCallConfirmationRequired`: requires human approval.
- `workspaceContextChanged` and `workspaceRebindResult`: synchronize binding identity, aliases, capabilities, and connection state.
- `contextFilesSelected`: returns internal references or temporary external snapshots selected by the user.
- `pathCompletions`: workspace path completion response carrying the binding revision.
- `availableTools`: available tool metadata.

Generation-specific outgoing stream and tool messages carry `generationId` and `conversationId`. The UI must ignore events that do not belong to the selected active generation.

Configuration consumers likewise ignore acknowledgements older than the latest applied revision. Permission-changing controls remain disabled until their acknowledgement arrives. Active generations retain one immutable permission snapshot per reasoning or tool round and recapture the authoritative revision only at the next boundary.

## Conversation schema

New conversations are written with `schemaVersion: 2` and a `workspaceBinding` containing logical identity, deterministic root aliases, composition revision, and capabilities. `workspaceUri` remains temporarily for migration compatibility. User and assistant messages carry `generationId`; assistant and error messages may carry a terminal `generationStatus` of `completed`, `interrupted`, or `error`. Activation atomically upgrades valid unversioned and partially migrated conversations as described in [Migration Status](../maintenance/Migration-Status.md). Compatibility has no date-based runtime cutoff.

## Compatibility

Historical naming such as `provider` may remain in internal names or messages, but product configuration must stay DeepSeek-only and must not expose an Ollama selector.

[Back](INDEX.md)
