> Priority: **P0 — stable release blocker**

## Context

`ChatHandler` accepts multiple `sendMessage` events without a host-side busy guard. Active runs share one `abortController`, one `ConversationState`, and one `ToolCallSession`.

Starting another request, creating a new chat, loading history, deleting the active conversation, or reloading the webview can therefore:

- overwrite the controller and pending confirmations of another run;
- mix stream chunks from different responses;
- cancel the wrong request;
- save a completed response into a different conversation;
- continue automatic tool execution after the user has navigated elsewhere.

Relevant code:

- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`
- `src/vscodeApi/webviews/handlers/HistoryHandler.ts`
- `src/ui/views/chatView/ChatView.tsx`

## Objective

Make every generation an isolated, uniquely identified operation and enforce a single authoritative active run.

## To-Do List

- [ ] Introduce a unique `generationId` and immutable run context containing the conversation ID, workspace context, configuration snapshot, cancellation controller, and tool session.
- [ ] Reject or explicitly queue a second `sendMessage` while a run is active.
- [ ] Include `generationId` in every stream, tool, completion, error, and cancellation message.
- [ ] Ignore stale host and webview events that do not belong to the current generation.
- [ ] Cancel and await the active run before new/load/delete conversation transitions.
- [ ] Save results only to the conversation captured when the run started.
- [ ] Ensure an older run's `finally` block cannot clear state owned by a newer run.
- [ ] Define recovery behavior when the webview is disposed or recreated during a run.

## Acceptance Criteria

- [ ] At most one generation can own mutable chat/tool state.
- [ ] Conversation navigation cannot move chunks, tool calls, or saved turns between conversations.
- [ ] Cancellation affects only the matching active generation.
- [ ] A stale completion cannot mutate current UI, history, workspace root, or session trust.
- [ ] The host remains authoritative even if the UI sends duplicate or out-of-order messages.

## Regression Tests

- [ ] Overlap two `sendMessage` events and complete their promises in reverse order.
- [ ] Trigger new/load/delete while streaming, awaiting tool confirmation, and running an automatic tool.
- [ ] Cancel an old generation after a newer generation has started.
- [ ] Dispose and recreate the webview while a generation is active.
- [ ] Verify that every persisted turn remains attached to its originating conversation.
