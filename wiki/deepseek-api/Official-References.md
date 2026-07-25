[Back](INDEX.md)

# Official References

Primary source: [DeepSeek API Docs](https://api-docs.deepseek.com/).

## Quick start

- [Your First API Call](https://api-docs.deepseek.com/): base URL, API key, initial models, and chat example.
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing): available models, context, maximum output, features, and deprecations.
- [Token & Token Usage](https://api-docs.deepseek.com/quick_start/token_usage): token definition and API-reported usage.
- [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit): limits, isolation, and `user_id` usage.
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes): expected HTTP errors and recommended handling.

## API guides

- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode): `thinking`, `reasoning_effort`, `reasoning_content`, and tool-call rules.
- [Multi-round Conversation](https://api-docs.deepseek.com/guides/multi_round_chat): message concatenation across turns.
- [FIM Completion Beta](https://api-docs.deepseek.com/guides/fim_completion): completion with `prompt` and `suffix` using the beta base URL.
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode): `response_format: { type: "json_object" }` and prompt requirements.
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls): tool format, `tool` messages, strict mode, and supported schemas.
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache): context cache and cache hit/miss tokens.

## API reference

- [API Reference](https://api-docs.deepseek.com/api/deepseek-api): Bearer authentication and endpoint map.
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion): full `/chat/completions` contract.
- [Create FIM Completion Beta](https://api-docs.deepseek.com/api/create-completion): full completion/FIM contract.
- [List Models](https://api-docs.deepseek.com/api/list-models): available models endpoint.

## Rules that affect the code

- The main chat endpoint is `POST /chat/completions`.
- `stream: true` returns SSE events and ends with `data: [DONE]`.
- `reasoning_content` appears separately from `content` in thinking mode.
- In thinking mode, `temperature` and `top_p` have no effect according to the official guide.
- Tool calls use `tools`, `tool_choice`, `tool` messages, and `tool_call_id`.
- Tool arguments arrive as a JSON string and must be validated before execution.
- JSON output requires `response_format` and prompt instructions asking for JSON.
- FIM beta uses `https://api.deepseek.com/beta` and a 4K token maximum.

[Back](INDEX.md)
