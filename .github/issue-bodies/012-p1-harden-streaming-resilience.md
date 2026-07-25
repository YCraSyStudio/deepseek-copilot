> Priority: **P1 — required before release candidate**

## Context

The HTTP timeout covers the complete response body, so a valid stream that continues producing data can still be aborted at the absolute timeout. SSE buffering has no maximum event or buffer size, and partial non-cancellation failures can leave the UI showing text that was never persisted in backend conversation context.

Some non-success finish reasons are only logged to the console or are not presented to the user.

An ordinary EOF without DeepSeek's terminal marker is currently treated as success, and retry behavior for non-idempotent completion POST requests is not explicitly constrained. Both cases can misreport a truncated response or create an ambiguous duplicate generation.

Relevant code:

- `src/deepseekApi/client/DeepSeekFetch.ts`
- `src/deepseekApi/streaming/ReadSSEStream.ts`
- `src/deepseekApi/providers/deepseek/features/Chat.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/ui/hooks/chat/UseChatMessagesController.ts`
- `src/vscodeApi/webviews/handlers/SettingsHandler.ts`

## Objective

Support long, active streams safely, bound all untrusted response data, and keep UI and persisted conversation state consistent after partial failures.

## To-Do List

- [ ] Split connection/header timeout from stream inactivity timeout.
- [ ] Reset the inactivity timer whenever valid response data arrives.
- [ ] Add maximum SSE event, buffer, reasoning, content, and tool-argument sizes.
- [ ] Cancel the reader and response body on every error/abort/connection-test exit.
- [ ] Treat EOF without the documented terminal marker/finish reason as incomplete.
- [ ] Define a method- and request-aware retry policy for non-idempotent completion POST requests.
- [ ] Represent partial responses explicitly as incomplete.
- [ ] Let the user retry, keep, or discard an incomplete turn without context divergence.
- [ ] Persist the selected partial-state outcome consistently.
- [ ] Surface length, content-filter, insufficient-resource, malformed-stream, and timeout endings visibly.
- [ ] Keep cancellation semantics distinct from provider/network failure.

## Acceptance Criteria

- [ ] A healthy stream longer than the current absolute timeout completes while data continues arriving.
- [ ] A stalled stream times out within the configured inactivity window.
- [ ] Malformed or oversized SSE data cannot grow memory without a bound.
- [ ] A truncated EOF is never reported as a normal `stop` completion.
- [ ] Ambiguous POST failures cannot be retried in a way that silently duplicates billable generations.
- [ ] The conversation context never silently differs from the response visible in the UI.
- [ ] Every finish reason produces a clear terminal UI state.

## Regression Tests

- [ ] Local stream emitting data beyond 60 seconds.
- [ ] Stream that stalls after headers and after partial content.
- [ ] Oversized single SSE event and stream without event delimiters.
- [ ] EOF without `[DONE]`, malformed-event reader cleanup, and ambiguous POST failure.
- [ ] Malformed JSON after partial reasoning/content/tool arguments.
- [ ] Retry/keep/discard flows and subsequent request context.
