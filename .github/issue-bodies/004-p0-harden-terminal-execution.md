> Priority: **P0 — stable release blocker**

## Context

Terminal safety currently depends on regular-expression classification of a shell command. Several mutating constructs can be classified as `safe`, including command forms involving append redirection, unhandled separators, and mutable Git subcommands.

In per-tool `auto_approve` mode, a `safe` classification executes immediately. Session trust is also keyed only by tool name, danger level, and raw arguments, so an approval can survive conversation/workspace changes.

Relevant code:

- `src/core/tools/definitions/DangerAnalysis.ts`
- `src/core/tools/definitions/TerminalCommand.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolExecution.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`

## Objective

Ensure terminal commands cannot bypass confirmation through incomplete text heuristics and scope every delegated approval to the exact conversation, workspace, and configuration in which it was granted.

## To-Do List

- [x] Define the terminal safety model and document which commands may execute without confirmation.
- [x] Treat unknown syntax, redirection, chaining, substitution, encoding, and shell-specific constructs as requiring confirmation.
- [x] Correct Git classification so only explicitly read-only argument combinations are eligible for automatic execution.
- [x] Account for Windows and POSIX separators and quoting rules.
- [x] Prefer a strict allowlist of parsed read-only forms over a broad list of executable names.
- [x] Bind conversation trust to the conversation, workspace URI, configuration, resolved execution context, and normalized arguments; bind each interactive response to its pending generation and tool call.
- [x] Reset trust on conversation, workspace, configuration, or permission-mode changes.
- [x] Keep destructive commands non-delegable for the session.
- [x] Show the resolved shell, working directory, and exact command in confirmations.

## Acceptance Criteria

- [x] No file-writing or Git-mutating command is classified as read-only.
- [x] Unrecognized syntax always requires explicit confirmation.
- [x] A trust decision can cross generations only inside the same conversation and cannot be reused in another conversation, workspace, or configuration.
- [x] Global `auto-approve` remains an explicit, clearly warned user choice rather than an accidental carry-over.
- [x] Safety behavior is consistent on PowerShell, `cmd.exe`, and supported POSIX shells.

## Regression Tests

- [x] Add table-driven tests for redirection, chaining, substitutions, encoded commands, package managers, publishing, and Git mutations.
- [x] Add positive tests for the small set of intentionally read-only commands and argument forms.
- [x] Verify trust reset and trust-key isolation across workspace/conversation changes.
- [x] Verify every non-safe command enters a confirmation state before execution.
