> Priority: **P1 — required before release candidate**

## Context

The webview/host protocol currently relies on optimistic, unacknowledged messages and component-local lifecycle state.

Confirmed failure modes include:

- message listener effects re-registering during renders and repeatedly requesting configuration;
- host listeners and stale webview references surviving view disposal;
- webview recreation losing processing/confirmation state while the old run continues;
- clear/new/load operations leaving a stale `conversationId`;
- oversized prompts or references being rejected silently after the draft is cleared;
- complete chat state being serialized on every streaming update;
- reset messages not updating every mounted view.

Relevant code:

- `src/vscodeApi/webviews/WebviewProvider.ts`
- `src/vscodeApi/webviews/WebviewMessageValidation.ts`
- `src/ui/views/chatView/hooks/UseMessageHandler.ts`
- `src/ui/views/chatView/ChatView.tsx`
- `src/ui/views/chatView/sections/inputArea/inputCtrl/InputCtrl.tsx`
- `src/ui/hooks/chat/UseChatMessagesController.ts`
- `src/ui/views/chatView/hooks/UseStreamHandler.ts`

## Objective

Define a durable, versioned host/webview protocol with stable subscriptions, acknowledgements, synchronized lifecycle state, and user-visible validation errors.

## To-Do List

- [ ] Register one stable webview message listener and route callbacks through refs or a stable dispatcher.
- [ ] Request initial configuration exactly once per resolved view.
- [ ] Track and dispose `onDidReceiveMessage` and `onDidDispose` registrations.
- [ ] Clear stale provider references and queue messages while no live view exists.
- [ ] Add request IDs and acknowledgements for send, config, conversation, and validation-sensitive actions.
- [ ] Clear drafts/references only after the host accepts the send.
- [ ] Enforce identical text/reference count and byte limits in UI and host.
- [ ] Return explicit validation errors instead of silently ignoring rejected messages.
- [ ] Synchronize `conversationId`, active generation, and pending tool state after clear/new/load/reload.
- [ ] Minimize and throttle `vscode.setState`; do not serialize the full growing conversation every stream frame.
- [ ] Cancel pending animation-frame deltas during reset/error/clear.
- [ ] Handle both `configLoaded` and `configReset` consistently.

## Acceptance Criteria

- [ ] Streaming renders do not cause repeated configuration requests or listener churn.
- [ ] No event is delivered to or lost through a disposed webview reference.
- [ ] Reloading the view cannot start a conflicting generation or lose a pending confirmation.
- [ ] Rejected input remains in the composer with a clear error.
- [ ] Clear/new/delete operations cannot restore an old conversation ID on the next send.
- [ ] Webview persistence cost remains bounded during long streams.

## Regression Tests

- [ ] Count listeners and `getConfig` requests during hundreds of stream updates.
- [ ] Dispose/recreate the view during streaming and confirmation.
- [ ] Send prompts at, below, and above every host limit.
- [ ] Attach more than 50 references and more than the total content budget.
- [ ] Exercise clear/new/load/delete/reset followed immediately by another action.
- [ ] Verify queued animation-frame deltas cannot repopulate a cleared chat.
