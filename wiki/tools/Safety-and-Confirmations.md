[Back](INDEX.md)

# Safety and Confirmations

## Modes

`toolExecutionModes` can configure each tool:

- `disabled`: do not execute.
- `enabled`: execute with normal rules.
- `auto_approve`: allow without confirmation if danger analysis does not require it.

The global `auto-approve` permission mode makes every non-disabled tool available and treats DeepSeek's emitted tool call as approval. It executes the forced handler directly without heuristic confirmation.

Global `auto-approve` is an explicit trust decision, not a security classifier. Workspace path validation and argument schemas still apply, but terminal commands are not protected by an OS sandbox.

## Danger analysis

Logic lives in `src/core/tools/definitions/DangerAnalysis.ts`.

It should mark as dangerous:

- deletions or overwrites.
- destructive commands.
- dangerous shell redirection.
- changes outside the workspace.
- secret usage.
- ambiguous high-impact operations.

## Expected UX

When there is risk:

1. backend sends `toolCallConfirmationRequired`.
2. UI shows tool, arguments, and reason.
3. user approves or cancels.
4. backend executes only if both `generationId` and `toolCallId` match the pending tool in that generation's `ToolCallSession`.

Session trust and pending confirmations are scoped to one generation. They must not authorize a tool call in another concurrent conversation.

Do not auto-approve a destructive operation just because the tool is set to `auto_approve`. The global `auto-approve` permission mode is the separate explicit opt-in that bypasses this confirmation.

[Back](INDEX.md)
