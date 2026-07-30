[Back](INDEX.md)

# Tools

Tools let DeepSeek read context, search, create files, and execute commands according to configuration and confirmations.

Base logic lives in `src/core/tools`. Built-ins are grouped into
`builtins/fileSystem` and `builtins/terminal`; the historical `definitions`
paths are compatibility re-exports. Actions that require VS Code run through
`ToolWorkspace`. Its VS Code adapter is split into `VsCodeToolWorkspace`,
`WorkspacePathResolver`, and `InlineDiffPreview`.

Principles:

- metadata and validation in `core`.
- real side effects in adapters.
- human confirmation for dangerous operations.
- structured results so the UI can render them well.
- public tool IDs and exports remain stable across internal moves.

[Back](INDEX.md)
