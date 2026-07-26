> Priority: **P0 — stable release blocker**

## Context

Permission and per-tool mode changes are optimistic in the webview. `saveConfig` is posted asynchronously, while the next chat request can immediately load the previous configuration from the extension host.

A user can therefore switch from `auto-approve` or `full-access` to a safer mode, see the safer value in the UI, and still start one generation with the old effective permissions. Reset and save failures can also leave the chat UI and host with different configurations.

Permission modes and per-tool execution modes are intentionally global. Trusted workspaces inherit those choices; untrusted workspaces must still receive a host-enforced safe effective configuration.

Relevant code:

- `src/ui/views/chatView/hooks/UseChatConfig.ts`
- `src/vscodeApi/webviews/handlers/SettingsHandler.ts`
- `src/vscodeApi/storage/SettingsManager.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/ui/views/chatView/hooks/UseMessageHandler.ts`

## Objective

Make global permissions host-authoritative, acknowledged, ordered, atomic from the user's perspective, and fail-closed in untrusted workspaces. Apply confirmed changes to active generations only at reasoning/tool-round boundaries.

## To-Do List

- [x] Add request IDs and a monotonically increasing authoritative revision to save/reset messages.
- [x] Keep send/tool controls disabled while a permission-affecting update is pending.
- [x] Publish effective in-memory configuration only after durable atomic persistence succeeds.
- [x] Return the authoritative normalized configuration in every acknowledgement.
- [x] Handle save/reset failure visibly and restore the last effective UI state.
- [x] Keep permission and per-tool modes global by design.
- [x] Require an explicit host confirmation before enabling global `auto-approve`.
- [x] Fail closed if the workspace is not trusted, even if manifest-level Restricted Mode behavior changes later.
- [x] Capture one immutable permission snapshot per reasoning or tool round.
- [x] Ensure permission changes take effect before any subsequently accepted request or round.
- [x] Handle out-of-order acknowledgements without reverting newer settings.

## Acceptance Criteria

- [x] The confirmed mode displayed as active is used by newly accepted generations.
- [x] A delayed disk write cannot allow one request or round under stale permissions.
- [x] Trusted workspaces inherit the global choice; untrusted workspaces effectively use `read-only` without auto-approval.
- [x] Save/reset errors are visible and do not leave split UI/host state.
- [x] Each reasoning/tool round uses one stable permission snapshot and adopts changes only at the next boundary.

## Regression Tests

- [x] Delay persistence, downgrade from `auto-approve`, and verify the next permission snapshot waits.
- [x] Deliver acknowledgements in reverse revision order and ignore the stale result.
- [x] Verify global elevated grants remain global for trusted workspaces.
- [x] Verify write/terminal paths fail closed and auto-approval is removed under a simulated untrusted workspace.
- [x] Simulate persistence failure and verify resident configuration and revision roll back.
- [x] Verify chat and settings consume the same normalized, revisioned result.
