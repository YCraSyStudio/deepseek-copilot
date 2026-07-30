[Back](INDEX.md)

# Layers

## `src/adapters`

Contains shared types and stable contracts:

- `deepseek/Chat.ts`: chat messages, request/response types, streaming chunks, and system prompt helpers.
- `Config.ts`: `AppConfig`, defaults, and DeepSeek-only configuration types.
- `messages/WebviewModels.ts`: shared wire models.
- `messages/WebviewRequests.ts`: messages accepted from the webview.
- `messages/WebviewEvents.ts`: events emitted to the webview.
- `messages/Webview.ts`: compatibility barrel for historical imports.
- `deepseek/Models.ts`: DeepSeek models and reasoning options.

This layer must not depend on React, VS Code, or HTTP.

## `src/core`

Contains framework-independent chat and tool logic:

- `GenerationCoordinator` for per-conversation queues and bounded cross-conversation concurrency.
- tool registry.
- execution and validation.
- file tools in `tools/builtins/fileSystem`.
- terminal tools and danger analysis in `tools/builtins/terminal`.
- `ToolWorkspace` interface and async-scoped host selection for workspace access without importing `vscode`.
- provider-neutral context compaction through a core-owned minimal interface.

Main rule: `core` must not import `vscode`.

## `src/deepseekApi`

Contains DeepSeek integration:

- DeepSeek provider.
- chat/FIM requests.
- SSE streaming.
- tool-call requests and parsing.
- API types and errors.

It should not contain UI logic or direct VS Code manipulation.

## `src/vscodeApi`

Contains concrete VS Code adapters:

- activation and commands.
- `WebviewProvider`.
- message handlers.
- settings, JSON-file conversation history, and generation checkpoints.
- API key access through `SecretStorage`.
- filesystem/workspace/terminal implementation for tools.
- chat orchestration in `webviews/handlers/chat`, split into slash commands,
  workspace references, generation context, execution, recovery, and checkpoints.
- workspace path resolution and inline diff preview as separate tool adapters.

## `src/ui`

Contains the React webview:

- Chat, History, and Settings views.
- messaging hooks.
- rendering for streaming, tool results, and confirmations.
- chat tool UI grouped under `components/chatView/tools`.
- settings grouped into `model`, `sections`, and `tabs`.
- Vite build to `dist/webview`.

[Back](INDEX.md)
