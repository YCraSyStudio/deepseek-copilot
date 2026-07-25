[Back](INDEX.md)

# Models and Configuration

Official reference:

- [Your First API Call](https://api-docs.deepseek.com/)
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode)
- [FIM Completion Beta](https://api-docs.deepseek.com/guides/fim_completion)

## Configuration

The webview settings UI persists the `AppConfig` fields supported by
`src/vscodeApi/storage/SettingsManager.ts`. Settings are global to the extension
and do not use VS Code configuration contributions.

`maxConcurrentGenerations` controls cross-conversation concurrency. It defaults to 8 and is normalized to an integer from 1 to 16; each conversation still permits only one active generation.

## Streaming behavior

Chat responses always use SSE streaming and are rendered progressively in the webview. This is a fixed product behavior, not a public setting.

## Secrets

`apiKey` is not part of public settings. It is stored with `SecretsManager` in VS Code `SecretStorage`.

## Defaults

Technical defaults should be centralized in `src/adapters/Config.ts`. Avoid duplicating them in handlers or UI except for non-persisted initial state.

## Provider

The product does not expose `provider`. DeepSeek is the only supported integration.

## API fidelity notes

- Current official models: `deepseek-v4-flash` and `deepseek-v4-pro`.
- `deepseek-chat` and `deepseek-reasoner` are compatibility names with a deprecation announced by DeepSeek.
- `thinking.type` accepts `enabled` or `disabled`; DeepSeek treats it as enabled by default.
- `reasoning_effort` accepts `high` or `max`.
- In thinking mode, `temperature` and `top_p` do not affect output according to the official guide.
- FIM beta requires base URL `https://api.deepseek.com/beta`; do not mix it with the normal endpoint without an explicit decision.

[Back](INDEX.md)
