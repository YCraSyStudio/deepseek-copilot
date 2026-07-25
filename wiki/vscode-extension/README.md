[Back](INDEX.md)

# VS Code Extension

The VS Code layer lives in `src/vscodeApi`, and the entry point is `src/Extension.ts`.

Responsibilities:

- register views and commands.
- render webviews.
- receive messages from React.
- connect handlers with settings, history, DeepSeek, and tools.
- adapt VS Code APIs so `core` does not depend on them.

The final bundle is generated at `dist/extension.js`.

[Back](INDEX.md)
