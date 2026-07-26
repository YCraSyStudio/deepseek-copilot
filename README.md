# Yar's DeepSeek Copilot

Yar's DeepSeek Copilot is a VS Code assistant focused entirely on DeepSeek. It adds a sidebar chat with streaming responses, a chronological reasoning and tool timeline, workspace-scoped history, path autocomplete, bounded context, and controlled tool execution.

> DISCLAIMER: Yar's DeepSeek Copilot is an independent third-party extension. It is not affiliated with, endorsed by, sponsored by, or officially maintained by DeepSeek. Preview releases may contain bugs; review tool calls and keep important work under version control.

> PRIVACY DISCLAIMER: Yar's DeepSeek Copilot does not collect, track, or transmit usage data. However, the extension uses the official DeepSeek API, so prompts, referenced workspace content, conversation context, and generated responses sent to DeepSeek may be processed in or transferred through China and may be cached or retained by DeepSeek. Review DeepSeek's current privacy policy and API terms before sending confidential, personal, or regulated information.

The extension is DeepSeek-only by design.

## Features

- Sidebar chat inside VS Code.
- Streaming responses from DeepSeek with native `think -> tool -> think -> response` ordering.
- Optional thinking mode with separate reasoning events for every tool round.
- Workspace-scoped conversation history with retention, lazy loading, deletion confirmation, and Undo.
- Type `./` or `../` in the chat input to autocomplete workspace paths.
- Explorer and editor commands for attaching files, folders, and exact selections.
- Tools for reading, listing, searching, creating, editing, patching, and running terminal commands.
- Structured, non-interactive terminal execution with timeout, bounded output, and process-tree cancellation.
- Permission selector in Chat and per-tool modes in Settings.
- Automatic bounded context from the active editor and staged or unstaged Git changes.
- Keyboard-accessible confirmations, controlled autoscroll, editable drafts during streaming, and reduced-motion support.
- Webview interface localized automatically in English, Spanish, and Chinese.
- Safety confirmations for dangerous or destructive tool calls.
- Stop generation restores the cancelled prompt to the input and does not keep it in conversation context.
- API key stored in VS Code Secret Storage.

## Requirements

- VS Code `1.125.0` or newer.
- A DeepSeek API key.
- Network access to the configured DeepSeek API base URL.

Get an API key from DeepSeek:

https://platform.deepseek.com/api_keys

## Getting Started

1. Install and open Yar's DeepSeek Copilot.
2. Open the Yar's DeepSeek Copilot activity bar item.
3. Go to Settings inside the chat view.
4. Paste your DeepSeek API key.
5. Choose model and generation settings.
6. Send a message from the Chat view.

## Commands

- `Yar's DeepSeek Copilot: Open Chat`
- `Yar's DeepSeek Copilot: New Chat`
- `Yar's DeepSeek Copilot: Add File to Chat`
- `Yar's DeepSeek Copilot: Add Selection to Chat`
- `Yar's DeepSeek Copilot: Review Changes`

## Extension Settings

Settings are managed from the extension UI and stored globally in:

```text
~/.yrs-dpsk-copilot/settings.json
```

This includes the model, reasoning options, limits, permission mode, per-tool execution modes, history retention, automatic context and global `AGENTS.md` access. Existing VS Code settings are copied to this file once and then removed from VS Code configuration.

The API key is never written to this file. It remains in VS Code Secret Storage.

## Tools and Safety

Yar's DeepSeek Copilot can execute workspace tools when enabled. Tool access is controlled first by permission mode:

- `chat`: no tools.
- `read-only`: read, list, and search workspace files.
- `workspace`: read-only tools plus file creation, editing, and patches.
- `full-access`: all tools, including terminal execution. Dangerous commands still require confirmation.
- `auto-approve`: all non-disabled tools. Non-terminal tools execute directly; terminal commands execute automatically only when the strict parser proves they are read-only and workspace-contained.

Tool execution is then controlled per tool:

- `disabled`: never execute the tool.
- `enabled`: execute with normal safety checks.
- `auto_approve`: execute without confirmation only when the operation is not considered dangerous.

Dangerous operations, such as overwriting files or running risky terminal commands, require confirmation. Terminal commands are not OS-sandboxed, so global `auto-approve` does not bypass confirmation for unknown, mutating, dynamic, or out-of-workspace shell forms.

Tool calls have one visible lifecycle: awaiting confirmation, running, then completed, rejected, cancelled, or error. Calls within a round execute sequentially, identical repeated calls are skipped, and the configured round limit stops loops.

Terminal commands are non-interactive. Results include stdout, stderr, exit code, signal, timeout and cancellation state, effective working directory, shell, and truncation state. Stopping generation cancels the complete spawned process tree.

## History and Privacy

- History is stored globally as one JSON file per conversation under `~/.yrs-dpsk-copilot/history/`.
- The history list is rebuilt from those files, so it cannot become detached from a separate index.
- Conversations show their source workspace and can be searched by title or workspace.
- Storage is capped at 100 conversations and 24 MiB and uses the configured retention period.
- Deleting one conversation or all visible conversations uses native VS Code confirmation and offers Undo.
- Deleting the active conversation also clears Chat view; deleting another conversation leaves it untouched.
- Interrupted pending or running tool calls are restored as cancelled. Corrupt records are isolated under `~/.yrs-dpsk-copilot/history/corrupt/`.

## Context and Chat Commands

Context is budgeted before every API request, including system prompts, tool schemas, history, references, output allowance, and a safety margin. Complete older generations are summarized atomically; oversized referenced files are reduced to literal relevant line ranges. Tool-call arguments, required reasoning, and an active tool cycle are never truncated. Referenced content is labeled with workspace-relative paths and delimited as untrusted data.

Available slash commands:

- `/status`, `/context`, `/tools`
- `/mode chat|read-only|workspace|full-access|auto-approve`
- `/auto-context on|off`
- `/review`, `/goal [text]`
- `/summarize`, `/clear-context`

## Documentation

- Visual documentation source: [`web-doc`](web-doc) with English, Spanish, and Chinese routes.
- Generated GitHub Pages site: [`docs`](docs).
- Technical documentation: [`wiki/`](wiki/INDEX.md)
- DeepSeek API reference: https://api-docs.deepseek.com/

## Development

```bash
npm install
npm run compile
npm run lint
npm run build
npm test
```

Build the GitHub Pages documentation:

```bash
cd web-doc
npm install
npm run build
```

Useful scripts:

- `npm run build:extension`: build the VS Code extension bundle.
- `npm run build:webview`: build the React webview.
- `npm run dev:webview`: start the webview dev server.

## Known Limitations

- DeepSeek is the only supported AI provider.
- Tool execution depends on workspace permissions and user confirmation.
- Terminal tools are deliberately non-interactive and cannot answer prompts or provide a TTY.
- FIM support follows DeepSeek beta API behavior and may require the beta base URL.
- This is a beta release. Review tool permissions before using it on important workspaces.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
