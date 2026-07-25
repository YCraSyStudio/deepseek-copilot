[Back](INDEX.md)

# Registry and Executor

## `ToolRegistry`

Keeps available definitions:

- id.
- description.
- argument schema.
- safety metadata.
- logical handler.

## `ToolExecutor`

Responsibilities:

- resolve tool by id.
- validate arguments.
- check execution mode.
- run handler.
- return structured result.
- serialize non-read-only operations by workspace while allowing read-only tools to proceed concurrently.

## `ToolWorkspace`

Interface that separates `core` from VS Code. It exposes capabilities such as:

- read file.
- write file.
- list directory.
- search text.
- execute commands.
- open file.

The current VS Code implementation is `VsCodeToolWorkspace`.

`runWithToolWorkspaceHost` binds a validating host through `AsyncLocalStorage` for the lifetime of one generation. This keeps concurrent conversations pinned to their own workspace instead of racing on the process-wide default host.

[Back](INDEX.md)
