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

`maxTokens` is the output allowance sent as `max_tokens`; it is not the model's
context-window size. DeepSeek documents a 1,000,000-token total context and a
384,000-token maximum output for both V4 models. The extension defaults to
65,536 output tokens and accepts values from 1 to 384,000. The request budget
subtracts this output allowance and a safety margin from the total context
before admitting input, tool schemas, and the canonical tool transcript.

`maxToolRounds` is a safety-checkpoint interval, not an unconditional lifetime
cap. It defaults to 6 and accepts values from 1 to 20. Default, read-only, and
custom modes pause at each checkpoint for the user's continue/stop decision.
Auto-approve and full-access do not apply round or per-block tool-call limits.

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
- Both current V4 models have a documented 1M-token context and 384K maximum output.
- `deepseek-chat` and `deepseek-reasoner` are compatibility names with a deprecation announced by DeepSeek.
- `thinking.type` accepts `enabled` or `disabled`; DeepSeek treats it as enabled by default.
- `reasoning_effort` accepts `high` or `max`.
- In thinking mode, `temperature` and `top_p` do not affect output according to the official guide.
- Tool-call assistant messages in thinking mode must retain their complete `reasoning_content` in subsequent API requests.
- FIM beta requires base URL `https://api.deepseek.com/beta`; do not mix it with the normal endpoint without an explicit decision.

[Back](INDEX.md)
