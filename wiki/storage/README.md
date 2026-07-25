[Back](INDEX.md)

# Storage

Persistence lives in `src/vscodeApi/storage`.

Goal:

- keep technical settings in `~/.yrs-dpsk-copilot/settings.json`.
- store the API key only in `SecretStorage`.
- store validated conversations as bounded JSON files.

The UI must not persist sensitive information on its own.

[Back](INDEX.md)
