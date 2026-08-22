[Back](INDEX.md)

# Storage

Persistence lives in `src/platform/vscode/storage`.

Goal:

- keep technical settings in `~/.yrs-dpsk-copilot/settings.json`.
- store the API key only in `SecretStorage`.
- store validated conversations as bounded JSON files.
- keep image attachment metadata in history and preview bytes in extension global storage.

The UI must not persist sensitive information on its own.

[Back](INDEX.md)
