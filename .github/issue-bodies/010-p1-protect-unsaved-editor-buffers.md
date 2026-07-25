> Priority: **P1 — required before release candidate**

## Context

File tools read and write through `vscode.workspace.fs`. When the target document is open with unsaved edits, the tool hashes and modifies the on-disk version rather than the user's current buffer.

This can overwrite disk content behind the editor, cause confusing conflicts, or be lost when the user later saves the stale buffer.

Relevant code:

- `src/vscodeApi/tools/VsCodeToolWorkspace.ts`
- `src/core/tools/definitions/EditFile.ts`
- `src/core/tools/definitions/ApplyPatch.ts`
- `src/core/tools/definitions/CreateFile.ts`

## Objective

Make file tools safe and predictable when target documents are open or dirty.

## To-Do List

- [ ] Detect open `TextDocument` instances for every file target.
- [ ] Define whether edits apply to the current document buffer through `WorkspaceEdit` or are blocked while dirty.
- [ ] Base previews and expected-content hashes on the same version that will be edited.
- [ ] Preserve undo/redo integration for editor-applied changes.
- [ ] Prevent a stale dirty buffer from silently overwriting a completed tool change.
- [ ] Surface an actionable conflict message when an automatic merge is unsafe.
- [ ] Handle create/rename/delete interactions with open editors.

## Acceptance Criteria

- [ ] A tool never silently overwrites or bypasses unsaved user content.
- [ ] The diff preview matches the exact buffer/version that receives the edit.
- [ ] Accepted changes participate in normal VS Code undo/redo where supported.
- [ ] Conflicts fail safely without changing disk or buffer content.

## Regression Tests

- [ ] Edit and patch a clean open document.
- [ ] Repeat with unsaved user changes before confirmation and before final write.
- [ ] Save the editor while a confirmation modal is open.
- [ ] Exercise undo/redo, external disk changes, and document closure during an operation.
- [ ] Test multi-root documents with the same relative path.
