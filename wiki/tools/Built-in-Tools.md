[Back](INDEX.md)

# Built-in Tools

## `read_file`

Reads file content from the workspace. It should limit output when the file is large.

## `create_file`

Creates or overwrites files. It must evaluate danger when there is overwrite risk or sensitive paths.

## `list_directory`

Lists files/folders. Useful for exploration before editing.

## `search_content`

Searches literal text case-insensitively through the VS Code workspace filesystem. It does not invoke a shell or interpret the query as a regular expression.

- `query` must contain non-whitespace text and is limited to 4,096 characters.
- `filePattern` is an optional workspace-relative glob. A bare pattern such as `*.ts` is normalized to `**/*.ts`; absolute and parent-traversal patterns are rejected.
- `filePattern` is limited to 1,024 characters and defaults to `**/*`.
- Files matching the shared sensitive-path policy are removed before their contents are read. This includes environment files, private keys, certificates, and paths named for tokens, secrets, or credentials.
- Binary files and files larger than 2 MiB are skipped.
- A search considers at most 10,000 files, returns at most 50 matches, limits each line preview to 2,000 characters, and caps retained output at 256 KiB.
- The operation times out after 15 seconds and follows request cancellation.
- The structured result includes `query`, normalized `filePattern`, `results`, `truncated`, `scannedFiles`, and `skippedFiles`.

## `run_terminal_command`

Executes commands in terminal/shell through the VS Code adapter. This is the most sensitive tool and must apply danger analysis.

## Results

Tools should return structured results when possible so:

- DeepSeek can continue reasoning.
- the UI can render previews.
- history keeps useful information.

[Back](INDEX.md)
