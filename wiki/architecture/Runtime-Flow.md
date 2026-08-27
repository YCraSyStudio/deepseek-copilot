[Back](INDEX.md)

# Runtime Flow

## Activation

1. VS Code activates the extension from `package.json`.
2. `src/extension/lifecycle/Activate.ts` constructs the DeepSeek provider, tools, storage, and `WebviewProvider`.
3. Settings and schema-v2 conversations are validated; generation checkpoints are recovered.
4. Work interrupted by host shutdown is stored as `interrupted`, unfinished tools become `cancelled`, and queued prompts are offered as recoverable drafts.
5. The `yrs-dpsk-copilot.chatView` view and commands are registered.

## Opening the chat

1. `WebviewProvider` loads `dist/webview`.
2. React requests protocol negotiation, configuration, history, available tools, workspace context, and a generation snapshot.
3. Correlated request, conversation, and generation IDs prevent late events from changing another chat.

## Attachments

1. The single `+` action opens one native picker for context files and images. `Ctrl+V`/`Cmd+V` can also paste an image.
2. The host inspects binary signatures. JPEG, PNG, GIF, and WebP files are uploaded to DeepSeek's Files API; other selections become bounded context snapshots.
3. Images are represented by metadata and `file_id`, never by persisted Base64. Clipboard Base64 exists only for the webview-to-host transfer.
4. V4 Vision receives `{ type: "file", file_id }` content directly. When V4 Pro needs the image, it calls `analyze_images`; V4 Vision returns a bounded text description to Pro.

## User message

1. The UI sends `sendMessage` with a unique `clientRequestId`, text, references, image attachments, and the displayed workspace revision.
2. `MessageAdmissionService` restores or creates the conversation, validates the captured workspace revision and file references, and only then enqueues the normalized request.
3. `GenerationCoordinator` permits one active run per conversation and up to `maxConcurrentGenerations` across conversations.
4. The run captures an immutable workspace binding, permission snapshot, model configuration, and `AbortController`.
5. `GenerationContext` builds and, when necessary, compacts the provider request. The default output allowance is 8,192 tokens.
6. Streaming timeline, tool state, and canonical provider transcript are checkpointed without secrets.
7. `GenerationRunFinalizer` reconciles persistence, usage, checkpoints, and exactly one terminal outcome; `GenerationExecutor` remains the orchestration boundary.

## Queue, steering, and cancellation

- A second ordinary send in the same conversation is queued.
- `steerGeneration` puts guidance at the front of the queue and ends the current transport as `interrupted`. The queued payload records the source generation; after its partial state is persisted, `GenerationContext` verifies that link and tells DeepSeek to continue the original task while applying the latest guidance. A stale link becomes an ordinary follow-up.
- Explicit `cancelGeneration` targets one generation, aborts context work, streaming, confirmations, browser work, tools, and terminal descendants, then persists a terminal `cancelled` turn.
- Stop preserves the submitted user message, partial assistant content, reasoning, and completed tool results. It does not restore the prompt as a draft and never rolls back completed external effects.
- Repeated or stale Stop requests are idempotent. Cancellation state belongs to that generation and cannot affect the next message.
- Shutdown, workspace changes, deletion, and steering use typed stop reasons and their own recovery semantics. A steered transport boundary is retained internally but is not rendered as a failed or manually interrupted response.

## Tool calls

1. DeepSeek emits function calls.
2. `ToolCallSession` validates them and applies the selected permission policy.
3. In automatic modes, a separate DeepSeek instance classifies mutations as routine, elevated, or critical.
4. Required confirmations are shown in the webview.
5. `ToolExecutionPipeline` runs through the generation-scoped workspace or infrastructure adapter.
6. Results return to the same model cycle. Completed side effects and their recorded results remain visible even if the later generation is cancelled.
7. Every 20 completed tool rounds, an independent tool-free progress reviewer decides whether concrete work remains, a final response should be produced, or progress requires a user decision. Its bounded recommendation guides the next normal round without disabling tools; the primary model can still perform a demonstrably necessary action.

Read-only work may overlap across conversations. Workspace mutations are serialized per logical workspace.

[Back](INDEX.md)
