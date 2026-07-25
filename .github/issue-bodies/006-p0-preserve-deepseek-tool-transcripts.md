> Priority: **P0 — stable release blocker**

## Context

Tool-enabled requests are forced into thinking mode, but hidden reasoning is only retained when it is exposed in the UI. Conversation persistence then reconstructs API messages from the display timeline.

Multi-round tool cycles are flattened into a single assistant message followed by collected tool results, losing the original sequence. Context pruning also truncates reasoning and `function.arguments` fields by inserting marker text, which can make tool arguments invalid JSON.

DeepSeek requires `reasoning_content` to be passed back for subsequent requests in a thinking-mode tool-call cycle. Sending a reconstructed or truncated transcript can cause request rejection or materially incorrect continuation behavior.

Relevant code:

- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`
- `src/core/chat/ConversationState.ts`
- `src/deepseekApi/providers/deepseek/features/toolCall/`

Official protocol reference:

- https://api-docs.deepseek.com/guides/thinking_mode/

## Objective

Persist and replay a protocol-valid DeepSeek transcript independently from what is displayed in the UI.

## To-Do List

- [ ] Store the canonical API message sequence for each tool round.
- [ ] Preserve hidden reasoning required for protocol continuation even when reasoning display is disabled.
- [ ] Keep the exact `assistant(tool_calls) -> tool results -> assistant` ordering for every round.
- [ ] Separate presentation timeline data from provider transcript data.
- [ ] Prune only complete atomic turns/tool cycles.
- [ ] Never insert truncation markers into JSON tool arguments or provider-required reasoning.
- [ ] Use a token-aware total request budget covering system prompts, instructions, references, tool definitions, history, and output allowance.
- [ ] Define a safe fallback when one atomic cycle cannot fit.

## Acceptance Criteria

- [ ] A persisted two-or-more-round tool conversation can be replayed with the same protocol sequence.
- [ ] Thinking-mode tool continuations always include the complete required reasoning content.
- [ ] Every transmitted `function.arguments` value is valid JSON.
- [ ] Context pruning cannot produce orphaned tool results or partial tool cycles.
- [ ] UI reasoning visibility does not change protocol correctness.

## Regression Tests

- [ ] Round-trip a two-round tool call through save, reload, and a subsequent API request.
- [ ] Repeat with reasoning hidden in the UI.
- [ ] Exercise arguments and reasoning larger than the current per-field limit.
- [ ] Verify total budgeting with large references, project instructions, and tool schemas.
- [ ] Add request-contract fixtures matching DeepSeek's documented thinking/tool sequence.
