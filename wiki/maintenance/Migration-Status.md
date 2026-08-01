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
- Marketplace metadata, README, MIT license, and VSIX packaging track the version declared in `package.json`.
- Legacy single-origin API credentials migrate to a versioned per-origin Secret
  Storage bundle without exposing the stored value to the webview.
- Conversations require `schemaVersion: 2` and a complete workspace binding. Invalid or unversioned files are isolated without being interpreted.

## Watch list

- Legacy internal names such as `ProviderFactory`, `BaseProvider`, or `tabs/providers`.
- Historical messages such as `providers` if the UI stops needing them.
- Duplicated defaults between UI and backend.
- Ensure `core` remains free of `vscode` imports.
- Ensure new tools use `ToolWorkspace` and not direct VS Code APIs.
- Keep `web-doc/src/i18n.ts` as the source of translated documentation strings.

## Criteria for removing legacy compatibility

Remove a legacy piece when:

- it is not part of the active webview contract.
- it has no references in UI or handlers.
- it does not provide required compatibility with supported settings or credentials.
- compile and lint pass after removal.

[Back](INDEX.md)
