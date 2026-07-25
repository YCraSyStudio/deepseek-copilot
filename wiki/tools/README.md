[Back](INDEX.md)

# Tools

Tools let DeepSeek read context, search, create files, and execute commands according to configuration and confirmations.

Base logic lives in `src/core/tools`. Actions that require VS Code run through `ToolWorkspace`, implemented in `src/vscodeApi/tools/VsCodeToolWorkspace.ts`.

Principles:

- metadata and validation in `core`.
- real side effects in adapters.
- human confirmation for dangerous operations.
- structured results so the UI can render them well.

[Back](INDEX.md)
