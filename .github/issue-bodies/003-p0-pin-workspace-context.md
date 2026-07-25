> Priority: **P0 — stable release blocker**

## Context

Workspace selection is currently resolved in several incompatible ways:

- tools may use a selected root, the active editor's folder, or `workspaceFolders[0]`;
- Git context, project instructions, path completion, and editor actions commonly use the first workspace folder;
- loading a global-history conversation whose original folder is not open silently falls back to another workspace;
- path validation captures one root, but the host can resolve a different root for the later read or write.

In a multi-root window, or when the active editor changes during an awaited filesystem check, context can be collected from project A while a tool reads or modifies project B. This also invalidates the symlink/traversal validation performed against the original root.

Relevant code:

- `src/vscodeApi/tools/VsCodeToolWorkspace.ts`
- `src/core/tools/ToolWorkspace.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/vscodeApi/webviews/handlers/chat/FileContext.ts`
- `src/vscodeApi/configuration/ProjectInstructions.ts`
- `src/vscodeApi/editor/EditorActions.ts`
- `src/vscodeApi/commands/ChatCommands.ts`
- `src/vscodeApi/storage/HistoryManager.ts`

## Objective

Bind each conversation and generation to one explicit, immutable workspace URI and use it consistently for context, validation, tools, Git, and editor navigation.

## To-Do List

- [ ] Introduce a shared workspace-context value object based on `vscode.Uri`, not a mutable global path.
- [ ] Capture that object when a conversation/run starts and pass it through every workspace operation.
- [ ] Make validation and the final filesystem operation use the same captured root.
- [ ] Remove silent fallback when a historical conversation's workspace is not open.
- [ ] Disable tools and show an actionable rebind/open-workspace prompt in that situation.
- [ ] Make root selection explicit in multi-root windows and surface the active root in the chat UI.
- [ ] Use the same root for Git context, `AGENTS.md`, file references, path completion, search results, and open-file actions.
- [ ] Clear or rebind root-scoped session trust whenever the workspace context changes.

## Acceptance Criteria

- [ ] A run cannot change workspace root after it begins.
- [ ] Switching the active editor cannot change the target of an in-flight operation.
- [ ] Continuing a conversation from another workspace never silently targets the current project.
- [ ] All context shown to the model originates from the same root used by its tools.
- [ ] Symlink/traversal checks remain valid through the final operation.

## Regression Tests

- [ ] Switch active editors between two roots while an awaited validation is paused.
- [ ] Load a conversation whose source workspace is closed.
- [ ] Verify Git, instructions, file context, search, write, and open-file behavior in a multi-root window.
- [ ] Test removal or renaming of the bound workspace during a generation.
- [ ] Test file and non-file URI schemes explicitly.
