> Priority: **P0 — stable release blocker**

## Context

Disabling history prevents `HistoryManager.save`, but `ConversationState` still appends turns to its in-memory active conversation. If history is enabled later, a subsequent save can persist turns that were created while history was disabled.

The webview also serializes complete messages and referenced file content through `vscode.setState` regardless of the history setting. This can preserve supposedly ephemeral content across webview recreation and conflicts with the user's privacy expectation.

Relevant code:

- `src/core/chat/ConversationState.ts`
- `src/vscodeApi/storage/HistoryManager.ts`
- `src/ui/views/chatView/ChatView.tsx`
- `src/ui/VsCodeApi.ts`

## Objective

Make “history disabled” a real persistence boundary across disk, extension memory, and webview state.

## To-Do List

- [ ] Define the exact persistence semantics for history-disabled conversations.
- [ ] Track ephemeral turns separately so later re-enabling history cannot persist them implicitly.
- [ ] Stop writing conversation messages and referenced file contents to webview state while history is disabled.
- [ ] Persist only the minimum safe UI state, such as an optional draft, under the documented policy.
- [ ] Clear previously persisted webview conversation state when history is disabled.
- [ ] Decide how an existing persisted conversation behaves when the user disables history mid-conversation.
- [ ] Make the UI explain what is and is not retained.

## Acceptance Criteria

- [ ] Turns created while history is disabled are never written to disk later without an explicit user action.
- [ ] Referenced file content and messages are not retained in webview state under disabled history.
- [ ] Reloading VS Code or recreating the webview does not restore ephemeral conversation content.
- [ ] Re-enabling history starts from a clearly defined clean persistence boundary.

## Regression Tests

- [ ] Disable history, send several turns, enable it, and send another turn.
- [ ] Recreate the webview and restart the extension host while history is disabled.
- [ ] Disable history in the middle of an existing saved conversation.
- [ ] Verify referenced files, tool outputs, reasoning, and drafts according to the chosen policy.
