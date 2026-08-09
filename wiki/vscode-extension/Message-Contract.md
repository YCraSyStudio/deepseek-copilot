[Back](INDEX.md)

# Message Contract

Protocol version 3 is split into `WebviewModels.ts`, `WebviewRequests.ts`, and
`WebviewEvents.ts`. `Webview.ts` remains the stable compatibility barrel. The UI
must not call backend internal APIs; it only sends messages through `postMessage`.

## Incoming from webview

- `sendMessage`: enqueues a prompt with a unique `clientRequestId`, conversation, referenced files, and the workspace revision displayed by the UI.
- `steerGeneration`: queues guidance at the front and interrupts the named generation.
- `cancelGeneration`: carries `requestId`, `conversationId`, and `generationId`; its acknowledgement is `accepted` or `stale`.
- `getGenerationSnapshot`: requests active runs, queues, and recovered drafts after webview mount.
- `consumeRecoveredDraft`: removes one restored queued prompt after the UI adopts it.
- `getConfig`: requests configuration and API key state.
- `saveConfig`: saves settings and API key transactionally and carries a unique `requestId`.
- `resetConfig`: restores defaults transactionally and carries a unique `requestId`.
- `testConnection`: validates DeepSeek connectivity.
- `getHistory`: lists saved conversations.
- `loadConversation`: loads a conversation by id and carries a navigation `requestId`.
- `loadConversationPage`: carries a navigation `requestId` and loads an earlier bounded page using the opaque cursor returned with the conversation.
- `deleteConversation`: deletes a conversation.
- `executeToolCall`: approves, executes, or rejects a pending tool call owned by a named generation.
- `toolCallLimitDecision`: continues or stops the named generation after a tool-round checkpoint in default, read-only, and custom modes.
- `getWorkspaceContext`: carries a request ID and resolves the conversation binding and its connected, disconnected, changed, or empty state.
- `rebindConversationWorkspace`: confirms and reassigns an existing conversation to the current logical workspace.
- `openConversationWorkspace`: opens the stored folder or `.code-workspace` in another window.
- `selectContextFiles`: opens the native picker and returns bounded context snapshots.
- `getPathCompletions`: returns `./` path suggestions for a conversation binding and revision.
- `getAvailableTools`: gets tool metadata.
- `openFile`: opens a file in VS Code.
- `newConversation`: carries a navigation request ID; only its matching `newConversationReady` may bind the blank view.

## Outgoing to webview

- `generationAccepted`: maps `clientRequestId` to the started `generationId` and conversation.
- `messageQueued`: reports the per-conversation queue position.
- `generationActivityChanged`: reports queued, running, cancelling, and settled background activity without leaking chat content.
- `cancelGenerationResult`: acknowledges an accepted or stale Stop request.
- `newConversationReady`: acknowledges only the correlated blank-chat navigation.
- `generationSnapshot`: rebuilds active generation state and exposes recovered drafts.
- `streamTimelineDelta`: incremental content or reasoning.
- `streamTimelineToolGroup`: chronological tool-call group.
- `streamDone`: successful generation end.
- `streamError`: UI-visible error.
- `configLoaded`: loaded authoritative configuration plus its monotonic revision.
- `configUpdateResult`: save/reset acknowledgement with request ID, revision, normalized authoritative configuration, operation, and `success`, `error`, or `cancelled` status.
- `history`: conversation list.
- `conversationLoaded`: recovered conversation.
- `conversationPageLoaded`: an earlier bounded page plus its next opaque cursor.
- `contextCompacted`: signals that a persisted, localized context-compaction marker should be shown.
- `generationRecoveryStarted`: the single concise recovery after reasoning pressure.
- `resourceLimitReached`: visible resource backpressure.
- `toolCallStarted`: tool call started.
- `toolCallResult`: tool result.
- `toolCallConfirmationRequired`: requires human approval.
- `workspaceContextChanged` and `workspaceRebindResult`: synchronize binding identity, aliases, capabilities, and connection state.
- `contextFilesSelected`: returns internal references or temporary external snapshots selected by the user.
- `pathCompletions`: workspace path completion response carrying the binding revision.
- `availableTools`: available tool metadata.

Generation-specific outgoing stream, message, usage, compaction, error, terminal, and tool messages carry required `generationId` and `conversationId`. A single pure UI guard ignores everything outside the selected active generation. A blank view rejects all old generation events; only a locally pending `clientRequestId` may bind a newly accepted conversation. History loads, pages, workspace context, and new-chat navigation ignore replies older than their latest request ID.

Configuration consumers likewise ignore acknowledgements older than the latest applied revision. Permission-changing controls remain disabled until their acknowledgement arrives. Active generations retain one immutable permission snapshot per reasoning or tool round and recapture the authoritative revision only at the next boundary.

## Conversation schema

Conversations require `schemaVersion: 2` and a `workspaceBinding` containing logical identity, deterministic root aliases, composition revision, and capabilities. User and assistant messages carry `generationId`; assistant and error messages may carry a terminal `generationStatus` of `completed`, `interrupted`, or `error`. During the compatibility window tracked by issue #61, structurally valid unversioned conversations are migrated atomically before validation; malformed files are isolated.

## Compatibility

Historical naming such as `provider` may remain in internal names or messages, but product configuration must stay DeepSeek-only and must not expose an Ollama selector.

[Back](INDEX.md)
