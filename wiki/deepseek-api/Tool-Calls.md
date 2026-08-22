[Back](INDEX.md)

# Tool Calls

Official references:

- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Vision](https://api-docs.deepseek.com/guides/vision)

Key files:

- `src/application/chat/toolCall/ToolCallCycle.ts`
- `src/infrastructure/deepseek/providers/deepseek/features/toolCall/ToolCallRequest.ts`
- `src/infrastructure/deepseek/providers/deepseek/features/toolCall/ToolCallStreaming.ts`
- `src/platform/vscode/webviews/handlers/chat/toolCalls/ToolCallSession.ts`
- `src/infrastructure/tools/builtins/vision/AnalyzeImages.ts`

## Cycle

1. DeepSeek receives currently enabled function definitions.
2. The response may end with `finish_reason: "tool_calls"` and JSON-string arguments.
3. The host parses and validates the call, applies the permission policy, and requests confirmation when required.
4. Calls in one round execute sequentially; identical name-and-argument calls are skipped.
5. Each result returns as `role: "tool"` with the original `tool_call_id`.
6. Default mode asks whether to continue at each configured round checkpoint. `auto-approve` and `full-access` have no round or per-block call limit.
7. Only complete `assistant(tool_calls) -> tool results -> assistant` sequences are replayed to the provider.

## `analyze_images`

This tool is included only for V4 Pro when the current prompt contains image attachments. Its arguments contain the visual question; trusted image file IDs come from generation context, not from model-provided paths or arbitrary IDs. It sends the images to `deepseek-v4-flash-vision-exp` with thinking disabled, then returns a bounded text description to Pro. V4 Vision does not receive this tool because it reads the same file content blocks directly.

## Strict mode

DeepSeek strict tool validation is currently beta and requires `https://api.deepseek.com/beta`, `strict: true` for every function, and a compatible JSON Schema subset. The extension validates schemas and arguments locally, but stable-endpoint transport omits the beta-only `strict` field. Do not enable it on the stable base URL without a separately tested beta transport.

## Persistence and cancellation

The webview receives the presentation timeline, never the hidden canonical transcript. A cancelled turn keeps completed tool cards and results visible, but an incomplete provider tool protocol is excluded from future replay. Tool cancellation is terminal and cannot later change to completed or mutate another generation.

[Back](INDEX.md)
