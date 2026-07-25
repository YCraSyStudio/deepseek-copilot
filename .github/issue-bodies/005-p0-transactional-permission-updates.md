> Priority: **P0 — stable release blocker**

## Context

Permission and per-tool mode changes are optimistic in the webview. `saveConfig` is posted asynchronously, while the next chat request can immediately load the previous configuration from the extension host.

A user can therefore switch from `auto-approve` or `full-access` to a safer mode, see the safer value in the UI, and still start one generation with the old effective permissions. Reset and save failures can also leave the chat UI and host with different configurations.

These high-risk settings are stored globally, so a trusted workspace can also inherit `auto-approve`, terminal auto-approval, or write access that was granted while working in a different repository.

Relevant code:

- `src/ui/views/chatView/hooks/UseChatConfig.ts`
- `src/vscodeApi/webviews/handlers/SettingsHandler.ts`
- `src/vscodeApi/storage/SettingsManager.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/ui/views/chatView/hooks/UseMessageHandler.ts`

## Objective

Make elevated permissions workspace-scoped, host-authoritative, acknowledged, ordered, and atomic from the user's perspective.

## To-Do List

- [ ] Add a request ID or monotonically increasing configuration version to save/reset messages.
- [ ] Keep send/tool controls disabled while a permission-affecting update is pending.
- [ ] Apply the effective in-memory configuration before or atomically with durable persistence.
- [ ] Return the authoritative normalized configuration in the acknowledgement.
- [ ] Handle save/reset failure visibly and restore the last effective UI state.
- [ ] Keep only safe defaults global; store elevated permission and per-tool auto-approval grants per workspace or session.
- [ ] Require an explicit confirmation before enabling `auto-approve` for a workspace/session.
- [ ] Ensure a newly opened workspace cannot inherit elevated grants from another project.
- [ ] Fail closed if the workspace is not trusted, even if manifest-level Restricted Mode behavior changes later.
- [ ] Capture one immutable configuration snapshot per generation.
- [ ] Ensure permission downgrades take effect before any subsequently accepted request.
- [ ] Handle out-of-order acknowledgements without reverting newer settings.

## Acceptance Criteria

- [ ] The mode displayed as active is always the mode used by newly accepted generations.
- [ ] A delayed disk write cannot allow one request under stale permissions.
- [ ] New workspaces start with the safe default unless the user explicitly grants elevated access there.
- [ ] Save/reset errors are visible and do not leave split UI/host state.
- [ ] Each generation uses one stable permission/tool-mode snapshot.

## Regression Tests

- [ ] Delay `SettingsManager.save`, downgrade from `auto-approve`, and attempt to send immediately.
- [ ] Complete two configuration writes in reverse order.
- [ ] Open two trusted workspaces and verify elevated grants do not carry between them.
- [ ] Verify all write/terminal paths fail closed under a simulated untrusted workspace.
- [ ] Simulate persistence failure during save and reset.
- [ ] Verify chat and settings views converge on the same normalized values.
