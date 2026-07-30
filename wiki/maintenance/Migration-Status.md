[Back](INDEX.md)

# Migration Status

## Current state

- `deepseek-copilot-old` was removed.
- The extension compiles from `src`.
- The main output is `dist/extension.js`.
- The webview builds from `src/ui`.
- Public configuration is DeepSeek-only.
- Human documentation lives in `web-doc` with Astro and has English, Spanish, and Chinese routes.
- Technical documentation lives in the repository `wiki/` directory.
- Marketplace metadata, README, MIT license, and VSIX packaging are being
  prepared for the `0.1.4` pre-release.
- Legacy single-origin API credentials migrate to a versioned per-origin Secret
  Storage bundle without exposing the stored value to the webview.
- New and rewritten conversations use `schemaVersion: 2`, with generation ownership and terminal status stored on messages.
- Activation atomically migrates valid unversioned history files, partially migrated schema-v2 files, and legacy `workspaceState` envelopes, then verifies the complete schema-v2 replacement before removing the old representation.
- Historical turns receive deterministic `generationId` values; historical assistant and error messages receive terminal `generationStatus` values.
- Compatibility has no date-based runtime cutoff and remains active until the cleanup release tracked by issue draft 019.

## Watch list

- Legacy internal names such as `ProviderFactory`, `BaseProvider`, or `tabs/providers`.
- Historical messages such as `providers` if the UI stops needing them.
- Duplicated defaults between UI and backend.
- Ensure `core` remains free of `vscode` imports.
- Ensure new tools use `ToolWorkspace` and not direct VS Code APIs.
- Keep `web-doc/src/i18n.ts` as the source of translated documentation strings.
- Remove temporary schema-v1/unversioned conversation migration by 2026-08-25 under issue draft 019. The date is a maintenance target, not a runtime cutoff.

## Criteria for removing legacy compatibility

Remove a legacy piece when:

- it is not part of the active webview contract.
- it has no references in UI or handlers.
- it does not provide compatibility with existing conversations/history.
- compile and lint pass after removal.

For conversation migration specifically, removal requires schema v2 to be mandatory at the type and validation boundaries, activation-time rewrite code and migration fixtures to be deleted, and unversioned files to be rejected or isolated.

[Back](INDEX.md)
