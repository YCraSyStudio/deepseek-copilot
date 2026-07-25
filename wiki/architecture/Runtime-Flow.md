[Back](INDEX.md)

# Runtime Flow

## Activation

1. VS Code activates the extension from the contributions declared in `package.json`.
2. `src/Extension.ts` creates the VS Code tool host.
3. `WebviewProvider.initialize()` migrates temporary legacy conversation data and recovers generation checkpoints.
4. Interrupted partial output is saved with `generationStatus: interrupted`; unfinished tool calls become `cancelled`, and queued prompts are exposed as recoverable drafts.
5. It registers `WebviewProvider.viewType = "yrs-dpsk-copilot.chatView"`, commands, and the chat view.

## Opening the chat

1. VS Code resolves the `yrs-dpsk-copilot.chatView` view.
2. `WebviewProvider` loads HTML from `dist/webview`.
3. The React UI starts with `vscodeApi`.
4. The UI requests configuration, history, available tools, and a generation snapshot.

## User message

1. The UI sends `sendMessage` with a unique `clientRequestId`.
2. `ChatHandler` resolves or creates the conversation and enqueues the request.
3. `GenerationCoordinator` allows one active run per conversation and up to `maxConcurrentGenerations` across conversations.
4. The run receives a unique `generationId`, an isolated `ConversationState`, and a workspace host pinned to the conversation URI.
5. `ChatHandler` loads settings and the API key, builds context, and starts streaming.
6. Every generation event carries `generationId` and `conversationId` so stale or background events cannot mutate the selected chat.
7. Progress is checkpointed, with streaming writes coalesced and tool-state transitions persisted immediately.
8. The completed or interrupted turn is saved to schema-v2 history.

## Queue, steering, and cancellation

- Sending while the same conversation is active appends a queued prompt.
- `steerGeneration` places guidance at the front of that conversation queue, then interrupts the named generation.
- `cancelGeneration` targets a specific `generationId`; partial assistant output remains in history as interrupted.
- Different conversations can continue concurrently, subject to the global limit of 1–16, default 8.

## Tool calls

1. DeepSeek emits tool calls.
2. `ToolCallSession` evaluates metadata and execution mode.
3. If the tool is dangerous, it sends `toolCallConfirmationRequired`.
4. The UI asks for human confirmation.
5. `ToolExecutor` runs using the generation-scoped `ToolWorkspace`.
6. The result goes back to DeepSeek or is shown in the UI depending on the cycle.

Read-only tools may run across concurrent generations. Workspace mutations are serialized per workspace to preserve write order.

## Referenced files

1. The user selects files through path autocomplete or an Explorer/editor command.
2. The extension resolves workspace-relative paths and bounded previews.
3. The chat sends the validated references as explicit context.

## Shutdown

Deactivation checkpoints active runs, cancels tool sessions and generation abort controllers, waits briefly for settlement, flushes checkpoint writes, and then disposes the provider.

[Back](INDEX.md)
