[Back](INDEX.md)

# Chat Streaming

Official references:

- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Vision](https://api-docs.deepseek.com/guides/vision)

Main path:

- `src/infrastructure/deepseek/providers/deepseek/DeepSeekProvider.ts`
- `src/infrastructure/deepseek/providers/deepseek/VisionFallback.ts`
- `src/infrastructure/deepseek/providers/deepseek/features/Chat.ts`
- `src/platform/vscode/webviews/handlers/chat/Streaming.ts`
- `src/platform/vscode/webviews/handlers/chat/generation/GenerationExecutor.ts`

## Flow

1. `GenerationCoordinator` starts a queued task with a unique `generationId` and `AbortController`.
2. `GenerationContext` builds a bounded provider transcript. Vision user messages may contain file-ID content blocks.
3. The provider sends `POST /chat/completions` with `stream: true`.
4. Content and `reasoning_content` deltas are normalized, correlated to conversation and generation, and rendered progressively.
5. Tool rounds append complete assistant/tool protocol messages to the host-only canonical transcript.
6. Progress is checkpointed. Persistence records `completed`, `cancelled`, `interrupted`, or `error`.
7. `GenerationExecutor` emits one terminal event after persistence reconciliation.

If the official API reports that experimental Vision is unavailable, the provider owns one bounded retry with stable V4 Flash. It does not mutate the selected UI model or persisted transcript. Image blocks are removed before the retry, and the injected fallback instruction requires the response to state that it could not inspect them. Non-stream image analysis used by V4 Pro fails closed instead.

## DeepSeek contract

- SSE ends with `data: [DONE]`.
- Reasoning is separate from visible content in thinking mode.
- When a thinking response calls tools, its `reasoning_content` is retained with the assistant tool-call message.
- Tool use remains supported when thinking is disabled.
- Usage may include prompt, completion, cache hit/miss, and reasoning tokens.

## Cancellation

`cancelGeneration` aborts only its named run. Explicit Stop preserves the submitted user message and all available assistant timeline data as a terminal `cancelled` turn. Completed tool effects and results remain recorded; no rollback is attempted. A later message gets a fresh cancellation scope.

`steerGeneration` is intentionally different: it queues guidance first and terminates the current turn as `interrupted` so a continuation can use bounded partial context. Host shutdown also uses interruption/recovery semantics rather than pretending the user pressed Stop.

Errors before acceptance use `requestRejected`; identified run failures use `streamError`. API keys, credentials, and unbounded provider response bodies must never appear in surfaced errors.

[Back](INDEX.md)
