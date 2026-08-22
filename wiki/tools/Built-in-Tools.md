[Back](INDEX.md)

# Built-in Tools

## Workspace tools

- `read_file`: reads bounded workspace content.
- `list_directory`: lists a workspace directory.
- `search_content`: searches literal text case-insensitively without invoking a shell or interpreting regular expressions.
- `create_file`: creates or overwrites a file after permission and stale-content checks.
- `edit_file`: applies structured edits with optimistic SHA-256 guards.
- `apply_patch`: applies a patch while preserving workspace containment.
- `run_terminal_command`: runs a non-interactive shell command with structured, bounded output and process-tree cancellation.

`search_content` accepts a non-empty query up to 4,096 characters and an optional workspace-relative glob up to 1,024 characters. It skips sensitive paths, binary files, and files over 2 MiB; scans at most 10,000 files; returns at most 50 matches; and times out after 15 seconds.

## Web tools

- `search_web`: uses the selected isolated headless search engine and returns up to ten normalized organic HTTPS URLs.
- `read_web`: reads only a URL registered to a search ID or explicitly supplied by the user, and returns bounded inert page sections.

The Web search toggle controls both definitions. When disabled, neither tool is sent to DeepSeek.

## Vision tool

- `analyze_images`: available to V4 Pro only when the current prompt has image attachments. It delegates trusted DeepSeek file IDs and a question to V4 Vision, then returns a bounded textual analysis. V4 Vision reads the same images directly and therefore does not receive this tool.

## Execution rules

Tools return structured results so DeepSeek can continue, the UI can render useful activity, and history can preserve completed work. Host-side schemas, workspace resolution, permission policy, and cancellation remain authoritative. Terminal and mutation sensitivity is classified by an independent DeepSeek review; there is no local danger analyzer.

[Back](INDEX.md)
