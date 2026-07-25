> Priority: **P1 — required before release candidate**

## Context

Settings and conversation history are stored in global user files. Mutation queues protect only one extension-host instance, while multiple VS Code windows can read and write the same files independently.

Additional race and durability risks include:

- retention reading an old record and deleting a newly saved version;
- delete/undo restoring an old snapshot over a newly completed turn;
- quota enforcement silently deleting an active or oversized new conversation;
- Windows atomic-replace fallback deleting the target before the replacement rename succeeds;
- extension activation failing entirely when the custom settings directory is unavailable.

Relevant code:

- `src/vscodeApi/storage/HistoryManager.ts`
- `src/vscodeApi/storage/SettingsManager.ts`
- `src/vscodeApi/storage/JsonFileStorage.ts`
- `src/vscodeApi/storage/UserDataPaths.ts`
- `src/vscodeApi/webviews/handlers/HistoryHandler.ts`
- `src/extension/lifecycle/Activate.ts`

## Objective

Make settings and history crash-safe, race-safe across windows, and capable of degrading gracefully when persistence is unavailable.

## To-Do List

- [ ] Choose a cross-window coordination strategy: locking, versioned compare-and-swap, append log, or VS Code-managed storage.
- [ ] Serialize retention, save, delete, and undo against the same authoritative version.
- [ ] Prevent stale snapshots from overwriting or deleting newer data.
- [ ] Replace delete-then-rename fallback with a recoverable backup/replace procedure.
- [ ] Warn before quota enforcement drops the active/new conversation.
- [ ] Bound file size before reading/parsing history and isolate corrupt files safely.
- [ ] Define conflict resolution for the same conversation edited in two windows.
- [ ] Let the extension activate in an explicit degraded mode when storage initialization fails.
- [ ] Prefer `ExtensionContext.globalStorageUri` unless compatibility requires the custom directory.

## Acceptance Criteria

- [ ] A concurrent save cannot be removed by stale retention or delete/undo work.
- [ ] Two windows cannot silently lose unrelated settings fields.
- [ ] A failed atomic replacement leaves either the old or new valid file recoverable.
- [ ] Quota and corruption handling never silently discard the active conversation.
- [ ] Storage failure produces a visible, actionable message without disabling the entire chat UI.

## Regression Tests

- [ ] Interleave retention and save of the same expired conversation.
- [ ] Complete a turn while delete confirmation is open, then exercise delete and undo.
- [ ] Simulate two SettingsManager/HistoryManager instances writing concurrently.
- [ ] Inject replacement failures on Windows-compatible code paths.
- [ ] Test oversized, malformed, unreadable, and unwritable storage files/directories.
