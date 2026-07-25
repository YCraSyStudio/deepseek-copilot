[Back](INDEX.md)

# DeepSeek API

The AI integration lives in `src/deepseekApi` and is exclusive to DeepSeek.

Responsibilities:

- build requests compatible with DeepSeek.
- run chat completion and streaming.
- expose FIM when used.
- support tool calls.
- map HTTP/SSE errors into errors handlers can consume.

Do not reintroduce `Ollama`, a multiprovider selector, or placeholders for other providers.

## External reference

The source of truth for the HTTP contract is the official documentation:

- [DeepSeek API Docs](https://api-docs.deepseek.com/)
- [API Reference](https://api-docs.deepseek.com/api/deepseek-api)
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)

Before changing request/response parameters, review those pages and update [Official references](Official-References.md).

[Back](INDEX.md)
