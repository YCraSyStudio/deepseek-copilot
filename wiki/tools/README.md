[Back](INDEX.md)

# Tools

Tools let DeepSeek read context, search, create files, and execute commands according to configuration and confirmations.

Application logic lives in `src/application/tools`. Concrete built-ins live in
`src/infrastructure/tools/builtins` and are grouped into `fileSystem`, `terminal`,
and `vision`. Actions that require VS Code run through `ToolWorkspace`; its
adapter lives under `src/platform/vscode/tools`.

Principles:

- metadata and validation in `application`.
- real side effects in infrastructure and platform adapters.
- confirmation according to `default`, `auto-approve`, or `full-access`.
- V4 Pro image understanding through `analyze_images`; V4 Vision reads file IDs directly.
- structured results so the UI can render them well.
- public tool IDs and exports remain stable across internal moves.

[Back](INDEX.md)
