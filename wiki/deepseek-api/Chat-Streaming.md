[Back](INDEX.md)

# Chat Streaming

Official reference:

- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Multi-round Conversation](https://api-docs.deepseek.com/guides/multi_round_chat)

## Main path

- `src/deepseekApi/providers/deepseek/DeepSeekProvider.ts`
- `src/deepseekApi/providers/deepseek/features/Chat.ts`
- `src/vscodeApi/webviews/handlers/chat/Streaming.ts`

## Flow

1. `GenerationCoordinator` starts a queued task with a unique `generationId` and `AbortController`.
2. `ChatHandler` prepares an isolated conversation state, messages, and configuration.
3. `createDeepSeekProvider(config)` creates the provider.
4. The provider opens an SSE request for chat responses.
5. Each chunk is normalized as content or reasoning and tagged with its generation and conversation.
6. `Streaming.ts` publishes events to the webview, where the UI renders accumulated deltas progressively rather than jumping per transport chunk.
7. Progress is checkpointed and the accumulated result is persisted with `completed`, `interrupted`, or `error` generation status.

## DeepSeek contract

- The main endpoint is `POST /chat/completions`.
- `messages` accepts `system`, `user`, `assistant`, and `tool` roles.
- `stream: true` sends deltas through Server-Sent Events and closes with `data: [DONE]`.
- In thinking mode, reasoning arrives as `reasoning_content`, separate from `content`.
- `finish_reason` may indicate `stop`, `length`, `content_filter`, `tool_calls`, or insufficient resources.
- `usage` may include prompt, completion, cache hit/miss, and reasoning tokens.

## Cancellation

`cancelGeneration` names the target `generationId` and aborts only that run. Cancellation preserves the user message and any partial assistant output as an interrupted turn. `steerGeneration` queues guidance at the front before cancelling the current run.

## Errors

Errors should arrive as `streamError` with a useful message. Do not leak the API key or full sensitive response bodies.

Review [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes) before changing HTTP error mapping.

[Back](INDEX.md)
