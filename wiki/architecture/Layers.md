[Back](INDEX.md)

# Layers

## `src/contracts`

Stable serializable contracts shared by the extension host and React webview:

- DeepSeek chat messages, models, tools, and configuration.
- protocol-v5 webview models, incoming requests, and outgoing events.
- no React, VS Code, filesystem, or HTTP dependencies.

## `src/application`

Framework-independent use cases and domain rules:

- conversation state, queues, generation ownership, context budgeting, and compaction.
- tool registry, validation, execution pipeline, and tool-call cycle.
- ports implemented by concrete model, persistence, runtime, and tool adapters.

Main rule: `application` must not import `vscode` or concrete DeepSeek clients.

## `src/infrastructure`

Concrete external integrations:

- DeepSeek chat/FIM requests, SSE validation, retries, Files API, and provider models.
- independent DeepSeek mutation review.
- built-in filesystem, terminal, and vision tools.
- isolated browser search and page extraction.

The `analyze_images` built-in delegates image file IDs to V4 Vision and returns text to V4 Pro. It does not expose VS Code UI concerns.

## `src/platform/vscode`

VS Code-specific adapters:

- activation, commands, workspace access, Secret Storage, settings, history, and generation checkpoints.
- webview routing and validation, native file picker, clipboard-image upload, and local image-preview cache.
- terminal process control, path resolution, confirmations, and native change diffs.

Host-side validation and permission decisions are authoritative; the webview never grants itself filesystem or tool access.

## `src/ui`

The React webview:

- Chat, History, and Settings views.
- one compact composer with unified attachments, model/reasoning picker, permission mode, and send/stop controls.
- chronological streaming, image previews, Activity groups, tool results, and confirmations.
- Vite output in `dist/webview`.

[Back](INDEX.md)
