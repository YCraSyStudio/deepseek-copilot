[Back](INDEX.md)

# Tool Calls

Official reference:

- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)

## Key files

- `src/deepseekApi/providers/deepseek/features/toolCall/ToolCallRequest.ts`
- `src/deepseekApi/providers/deepseek/features/toolCall/ToolCallStreaming.ts`
- `src/deepseekApi/providers/deepseek/features/toolCall/ToolCallCycle.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`

## Cycle

1. The conversation is sent with tool definitions.
2. DeepSeek responds with tool calls.
3. The backend validates the tool and arguments.
4. Danger and execution mode are evaluated.
5. If confirmation is required, the UI decides.
6. The tool result goes back into the DeepSeek cycle.
7. The final answer is shown and persisted.

## Rules

- Tool definitions live in `core`.
- Concrete execution uses `ToolWorkspace`.
- Each generation owns its own `ToolCallSession`; approvals and round-limit decisions include `generationId`.
- Destructive or ambiguous operations must require confirmation.
- The UI should show structured results when available.

## DeepSeek contract

- DeepSeek receives tools through the `tools` parameter.
- The API currently supports tools of type `function`.
- `tool_choice` can control whether the model avoids, chooses, or forces a tool.
- The response may end with `finish_reason: "tool_calls"`.
- Each result must return as a message with `role: "tool"` and `tool_call_id`.
- Arguments arrive as a JSON string; code must parse and validate them.
- In thinking mode with tool calls, `reasoning_content` must be preserved for later turns.
- `strict` mode is beta and requires the beta base URL and compatible schemas.

[Back](INDEX.md)
