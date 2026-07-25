[Back](INDEX.md)

# Dependency Rules

## Hard rules

- `src/core` must not import `vscode`.
- `src/adapters` must not import `vscode`, React, or HTTP clients.
- `src/ui` must not import Node extension code.
- `src/deepseekApi` must not import React or VS Code.
- `apiKey` must not be stored in settings; it only belongs in `SecretStorage`.
- The extension is DeepSeek-only: do not add Ollama branches or a multiprovider selector.

## Allowed direction

- `vscodeApi` may depend on `core`, `adapters`, and `deepseekApi`.
- `core` may depend on `adapters`.
- `deepseekApi` may depend on `adapters`.
- `ui/chat` should communicate with the backend only through the message contract.
- Concurrent generations must use an async-scoped `ToolWorkspace`; do not switch the process-wide host while a run is active.
- Conversation writes remain serialized per conversation, and mutating tools remain serialized per workspace.

## When to create an interface

Create an interface when domain logic needs to:

- read files.
- write files.
- list directories.
- search content.
- execute commands.
- access the active workspace.

The concrete implementation should live in `src/vscodeApi`.

[Back](INDEX.md)
