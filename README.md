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
- Type `./` in the chat input to autocomplete workspace paths.
- Explorer and editor commands for attaching files and exact selections; external files are added only as bounded read-only snapshots.
- Tools for reading, listing, searching, creating, editing, patching, and running terminal commands.
- Current web search through an isolated headless Chromium runtime with an HTTPS-only SSRF-resistant proxy, localized provider fallback, compact semantic reads, and no native VS Code browser confirmations.
- Reuses compatible local Edge or Chrome installations and can install a pinned, extension-managed Chromium Headless Shell when neither is available.
- Structured, non-interactive terminal execution with timeout, bounded output, and process-tree cancellation.
- Permission selector in Chat and per-tool modes in Settings.
- Automatic bounded context from the active editor and staged or unstaged Git changes.
- Keyboard-accessible confirmations, controlled autoscroll, editable drafts during streaming, and reduced-motion support.
- Webview interface localized automatically in English, Spanish, and Chinese.
- Safety confirmations for dangerous or destructive tool calls.
- Two-stage command review in `auto-approve`: local analysis first, then a bounded DeepSeek safety review when a workspace-contained command remains uncertain.
- Compact expandable Activity groups for reasoning and tool calls.
- `Open file` and per-operation `View change` actions for file tools; successful file reads do not duplicate editor content in Chat.
- Stop generation restores the cancelled prompt to the input and does not keep it in conversation context.
- API credentials stored per API origin in VS Code Secret Storage and represented in Settings only by a masked placeholder.
- Provider-reported token and cache observability: every attempted streaming and non-streaming request is counted once, valid usage is attributed to a phase (`primary`, `tool_round`, `security_review`, `context_summary`, `file_compaction`), and redacted totals are aggregated per generation and conversation without storing prompts, commands, paths, or file contents.

## Requirements

- VS Code `1.131.0` or newer.
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
- `Yar's DeepSeek Copilot: Install Chromium Headless`
- `Yar's DeepSeek Copilot: Update Chromium Headless`
- `Yar's DeepSeek Copilot: Remove Chromium Headless`

## Extension Settings

Settings are managed from the extension UI and stored globally in:

```text
~/.yrs-dpsk-copilot/settings.json
```

This includes the model, reasoning options, limits, permission mode, per-tool execution modes, history retention, automatic context and global `AGENTS.md` access. Existing VS Code settings are copied to this file once and then removed from VS Code configuration.

The API key is never written to this file or returned as webview configuration. Credentials remain in VS Code Secret Storage, are isolated by API origin, and appear in Settings only as a masked placeholder. Changing to a different API origin requires explicit confirmation and never copies the existing credential.

Web search uses an extension-owned headless runtime, so it never invokes VS Code's native browser tools or their confirmation dialogs. `yrs-dpsk-copilot.webSearch.engine` selects `auto`, DuckDuckGo, Bing, Google, or Yahoo; `yrs-dpsk-copilot.webSearch.locale` accepts `auto` or a BCP-47 locale such as `es-ES`. The runtime prefers a compatible local Edge or Chrome installation. If neither is available, it offers a pinned Chromium Headless Shell download in extension global storage; the browser is not included in the VSIX.

Every web navigation uses a fresh temporary profile and a loopback-only HTTPS CONNECT proxy. The proxy rejects private, local, literal-IP, alternate-port, mixed-DNS, rebinding, third-party and non-HTTPS destinations and enforces request, transfer, redirect, concurrency and timeout limits. Search returns at most five registered organic results; `read_web` accepts only one of those results or an HTTPS URL written literally in the current user request. Extracted text is bounded, active content is removed, and web content is marked as untrusted evidence rather than instructions.

## Tools and Safety

Yar's DeepSeek Copilot can execute workspace tools when enabled. Tool access is controlled first by permission mode:

- `default`: all tools are available and request confirmation before execution.
- `read-only`: read, list, and search execute automatically; writing and terminal tools remain available but require confirmation.
- `custom`: configure every tool as disabled, confirmation required, or auto approved.
- `auto-approve`: all tools, including workspace-contained terminal commands, execute automatically. External filesystem access and commands that cannot be proven workspace-contained still require confirmation.
- `full-access`: unrestricted unattended access before web content is consumed. Post-web external, network, credential, publication, remote, destructive, or ambiguous effects still fail closed to manual confirmation.

Tool execution is then controlled per tool:

- `disabled`: never execute the tool.
- `enabled`: execute with normal safety checks.
- `auto_approve`: execute without confirmation only when the operation is not considered dangerous.

Changing an individual tool while a preset is selected copies that preset into `custom` automatically. Terminal commands are not OS-sandboxed. In `auto-approve`, a conservative local analyzer handles commands it understands; uncertain workspace-contained commands may receive a separate DeepSeek security review using the initial user request and bounded, non-sensitive context from explicitly named workspace files. Automatic approval or replanning requires at least `medium_high` confidence. Credentials, elevation, external or remote mutation, broad process termination, publishing, deployment, and destructive operations are never delegated to that reviewer. Unresolved cases ask the user. Enabling `full-access` shows a global danger warning because it removes workspace containment and confirmation prompts. VS Code Workspace Trust and cancellation remain enforced. Legacy `chat` and transitional `enabled` settings migrate to `default`; legacy `workspace` migrates to `full-access`.

After either web tool succeeds, that generation is marked web-tainted. Reads continue automatically under the selected mode, but file mutations and patches must first pass their normal local preview and workspace-boundary checks, then a content-free automatic review. The reviewer receives the current trusted user request, operation type and path, but never raw web text or proposed file content. Commands with network or external effects are never auto-approved after web access.

Tool calls have one visible lifecycle: awaiting confirmation, running, then completed, rejected, cancelled, or error. Calls within a round execute sequentially and identical repeated calls are skipped. The configured tool-round value is a safety-checkpoint interval: auto-approve and full-access ask DeepSeek to reassess whether to continue, request instructions, or stop; other modes ask the user whether to continue.

DeepSeek V4 provides a 1M-token total context and supports up to 384K output tokens. `maxTokens` controls only the per-request output allowance; it defaults to 65,536, leaving the rest of the context budget for input, tools, history, and a safety margin.

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

Context is budgeted before every API request, including system prompts, tool schemas, history, references, output allowance, and a safety margin. After a generation completes, future requests retain only its user message and final assistant answer; old tool output and provider reasoning remain out of the next turn. Older visible context is summarized when the budget requires it, and oversized referenced files are reduced to literal relevant line ranges. Tool-call arguments, required reasoning, and an active tool cycle are never truncated. Referenced and web content is delimited as untrusted data.

Available slash commands:

- `/status`, `/context`, `/tools`
- `/mode default|read-only|auto-approve|full-access|custom`
- `/auto-context on|off`
- `/review`, `/goal [text]`
- `/summarize`, `/clear-context`

## Usage and Cost Observability

DeepSeek reports usage per request. The extension parses and validates both streaming and non-streaming responses, including `completion_tokens_details.reasoning_tokens`, `prompt_cache_hit_tokens`, and `prompt_cache_miss_tokens`, and attributes every attempted request to a stable phase: `primary`, `tool_round`, `security_review`, `context_summary`, or `file_compaction`. A request whose usage is absent or malformed is still counted, while unavailable fields remain explicitly unavailable instead of being represented as zero.

- Aggregates are stored per assistant message (counts only — never prompts, commands, paths, or response contents), combined into a conversation total, and can be shown from Settings -> General -> Usage & cost.
- Redacted generation and conversation summaries are written to the Diagnostics output channel; run `Yar's DeepSeek Copilot: Show Diagnostics` to inspect them.
- Currency is estimated only for the official DeepSeek endpoint when every request supplies cache-hit, cache-miss, and output counts. The persisted `PRICE_CATALOG_VERSION` identifies the price snapshot. Custom endpoints report provider usage without guessing a price or automatically adding DeepSeek-specific stream options.
- Configurable warning budgets (auxiliary calls, cache-miss input, output, estimated total cost) surface a warning when exceeded. Warnings never truncate or cancel work.
- Provider-side context caching is best-effort and reuse requires stable request prefixes. Reported usage is authoritative. To measure an optimization, compare like-for-like generations or conversation summaries using the same model and price-catalog version; use cache-miss input as the primary reduction metric and cache-hit divided by total reported input as the hit ratio. Requests without reported cache fields are outside that comparison boundary.

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
- The extension uses the stable Chat Completions endpoint. DeepSeek beta-only strict tool schemas, chat-prefix completion, and FIM are not exposed; custom base URLs are never rewritten to a beta route.
- This is a beta release. Review tool permissions before using it on important workspaces.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
