[Back](INDEX.md)

# Activation and Contributions

## Entry

`package.json` declares:

- `main`: `./dist/extension.js`.
- activity bar container: `yrs-dpsk-copilot-sidebar`.
- webview view: `yrs-dpsk-copilot.chatView`.
- commands: `yrs-dpsk-copilot.openChat`, `yrs-dpsk-copilot.addSelectionToChat`.

VS Code automatically generates activation events from those contributions. Do not keep a manual `activationEvents` list unless there is a specific reason.

## `activate(context)`

`src/Extension.ts` should:

- create `VsCodeToolWorkspace`.
- inject it into `core/tools`.
- create `WebviewProvider`.
- register it in `ExtensionRuntime` and await history/checkpoint initialization.
- register `WebviewProvider.viewType`.
- register commands.
- add disposables to `context.subscriptions`.

## `deactivate()`

It awaits `shutdownActiveProvider()`. Shutdown checkpoints active work, cancels tool sessions and generation controllers, flushes checkpoint writes, and disposes the provider before clearing runtime references.

[Back](INDEX.md)
