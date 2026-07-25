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

Ensure terminal commands cannot bypass confirmation through incomplete text heuristics and scope every delegated approval to the exact run and workspace in which it was granted.

## To-Do List

- [ ] Define the terminal safety model and document which commands may execute without confirmation.
- [ ] Treat unknown syntax, redirection, chaining, substitution, encoding, and shell-specific constructs as requiring confirmation.
- [ ] Correct Git classification so only explicitly read-only argument combinations are eligible for automatic execution.
- [ ] Account for Windows and POSIX separators and quoting rules.
- [ ] Prefer a strict allowlist of parsed read-only forms over a broad list of executable names.
- [ ] Bind session trust to the generation, workspace URI, tool call, and normalized arguments.
- [ ] Reset trust on conversation, workspace, configuration, or permission-mode changes.
- [ ] Keep destructive commands non-delegable for the session.
- [ ] Show the resolved shell, working directory, and exact command in confirmations.

## Acceptance Criteria

- [ ] No file-writing or Git-mutating command is classified as read-only.
- [ ] Unrecognized syntax always requires explicit confirmation.
- [ ] A trust decision cannot be reused in another conversation, generation, or workspace.
- [ ] Global `auto-approve` remains an explicit, clearly warned user choice rather than an accidental carry-over.
- [ ] Safety behavior is consistent on PowerShell, `cmd.exe`, and supported POSIX shells.

## Regression Tests

- [ ] Add table-driven tests for redirection, chaining, substitutions, encoded commands, package managers, publishing, and Git mutations.
- [ ] Add positive tests for the small set of intentionally read-only commands and argument forms.
- [ ] Verify trust reset and trust-key isolation across workspace/conversation changes.
- [ ] Verify every non-safe command enters a confirmation state before execution.
