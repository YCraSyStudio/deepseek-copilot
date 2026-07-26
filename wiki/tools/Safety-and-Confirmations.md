[Back](INDEX.md)

# Safety and Confirmations

## Modes

`toolExecutionModes` can configure each tool:

- `disabled`: do not execute.
- `enabled`: execute with normal rules.
- `auto_approve`: allow without confirmation only when the tool proves the operation is safe.

The global `auto-approve` permission mode is an explicit, warned delegation for non-disabled tools. Non-terminal tools may use their forced handlers directly because their schemas and workspace validation remain authoritative. Terminal commands always pass through danger analysis first.

`full-access` is the unattended permission mode. Every non-disabled tool, including terminal commands, executes immediately without a confirmation request. Workspace binding, tool path validation, disabled tools, cancellation, and VS Code Workspace Trust remain enforced. The removed legacy `workspace` mode migrates to `full-access`.

Terminal commands are not protected by an OS sandbox. Outside `full-access`, an unknown, mutating, dynamic, encoded, chained, redirected, or potentially out-of-workspace command requires explicit confirmation.

## Terminal read-only model

Logic lives in `src/core/tools/definitions/DangerAnalysis.ts`.

The analyzer resolves the actual shell and working directory, tokenizes only a conservative subset of that shell's syntax, and accepts a small allowlist of read-only forms:

- POSIX: basic location and identity queries plus modeled `ls`, `cat`, `head`, `tail`, and `grep` forms.
- `cmd.exe`: modeled `dir`, `type`, `where`, identity, version, and output forms.
- PowerShell: modeled `Get-Location`, `Get-ChildItem`, `Get-Content`, and `Select-String` forms.
- Git: selected read-only forms of `status`, `diff`, `log`, `show`, `rev-parse`, `ls-files`, and `branch --show-current`.

Every flag not explicitly supported requires confirmation. Path operands must resolve through existing ancestors and remain within the captured workspace; traversal, absolute paths, providers, globs, and external symlinks are not automatically approved. An unknown shell never produces a safe classification.

## Expected UX and delegated trust

When there is risk and the permission mode is not `full-access`:

1. the backend sends `toolCallConfirmationRequired`;
2. the UI shows the exact command, resolved shell, working directory, arguments, and reason;
3. the user executes once, trusts the exact operation for the conversation, or cancels;
4. the backend accepts the response only for the pending `generationId` and `toolCallId`.

Non-destructive trust may be reused by an exact normalized operation in later generations of the same conversation. Its key also contains workspace URI, resolved execution context, and the relevant configuration fingerprint. It is cleared on conversation, workspace, configuration, or permission-mode changes. Destructive operations are never delegated and require separate confirmation every time.

[Back](INDEX.md)
