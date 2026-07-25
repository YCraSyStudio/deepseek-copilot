[Previous page: Overview](INDEX.md)

# Built-in Tools

## `read_file`

Reads file content from the workspace. It should limit output when the file is large.

## `create_file`

Creates or overwrites files. It must evaluate danger when there is overwrite risk or sensitive paths.

## `list_directory`

Lists files/folders. Useful for exploration before editing.

## `search_content`

Searches literal text case-insensitively in workspace files, with an optional workspace-relative glob filter. Sensitive, binary, and oversized files are skipped, and the result size is bounded.

## `run_terminal_command`

Executes commands in terminal/shell through the VS Code adapter. This is the most sensitive tool and must apply danger analysis.

## Results

Tools should return structured results when possible so:

- DeepSeek can continue reasoning.
- the UI can render previews.
- history keeps useful information.

---

[Next page: Safety and Confirmations](Safety-and-Confirmations.md)
