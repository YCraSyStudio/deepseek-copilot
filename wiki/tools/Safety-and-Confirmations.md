[Back](INDEX.md)

# Safety and Confirmations

## Modes

`toolExecutionModes` can configure each tool:

- `disabled`: do not execute.
- `enabled`: execute with normal rules.
- `auto_approve`: allow without confirmation only when the tool proves the operation is safe.

`default`, `read-only`, `auto-approve`, and `full-access` are predefined starting points. Editing any individual tool copies the selected preset into `custom` automatically, where each tool can be disabled, require confirmation, or be auto approved.

- `default` exposes every tool and asks before execution.
- `read-only` auto approves read, list, and search; file mutations and terminal commands remain enabled but ask before execution.
- `auto-approve` executes tools automatically when their paths and terminal operations are contained in the workspace. An external path or command requires explicit confirmation.
- `full-access` removes workspace containment and confirmation prompts. Enabling it displays a global warning because tools may read, modify, or delete data anywhere on the computer.

Terminal commands are not protected by an OS sandbox. Under `auto-approve`, package operations, builds, tests, and other mutations may run automatically when their command syntax and paths are workspace-contained. Dynamic, elevated, remote, or external operations still require confirmation.

## Terminal read-only model

Logic lives in `src/core/tools/builtins/terminal/DangerAnalysis.ts`; the old
`definitions` path remains a compatibility export.

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

The remote reviewer lives in `src/deepseekApi/security/commandReview`. It
receives the initial user request and bounded read-only context for affected
files. A locally uncertain operation is executed automatically only when the
review reaches the configured accepted confidence; unresolved doubt falls back
to the manual confirmation above.

The reviewer returns one of three decisions:

- `approve`: execute only when local workspace containment is also proven.
- `revise`: return concise constraints to the primary agent so it can continue
  with a safer or more focused tool call.
- `manual_confirmation`: preserve the exact command for a human decision.

Confidence levels are `very_high`, `high`, `medium_high`, `medium`,
`medium_low`, `low`, and `very_low`. Only `medium_high` or above can approve or
revise automatically. File context is limited to explicitly named,
non-sensitive workspace files, at most three files and 4 KiB per preview.
Commands containing likely credentials are not sent for remote review.

Credential exposure, elevation, publishing, deployment, remote mutation,
external access, broad process termination, download-and-execute flows, and
destructive delete, Git, or disk operations are non-delegable. A remote
approval never overrides the local workspace boundary.

[Back](INDEX.md)
