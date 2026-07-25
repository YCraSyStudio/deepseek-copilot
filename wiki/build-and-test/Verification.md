[Back](INDEX.md)

# Verification

## Before closing code changes

Run:

```bash
npm run compile
npm run lint
npm run build
npm test
```

## Web documentation

Run in `web-doc`:

```bash
npm run build
```

## Manual validation

In Extension Development Host:

- open the DeepSeek Copilot sidebar.
- save API key.
- test connection.
- send a message with streaming.
- send messages in different conversations and verify they can run concurrently up to the configured limit.
- send a second message in the same conversation and verify it remains queued.
- use Interrupt and guide and verify the guidance runs before older queued prompts.
- cancel a generation and verify its user message and partial assistant output remain marked as interrupted.
- reload or recreate the webview during a run and verify the generation snapshot restores visible state.
- close VS Code with active and queued work, then verify partial output and queued prompts recover on activation.
- use history.
- type `./` or `../` in the chat input and select a suggested path.
- execute a safe tool.
- confirm or cancel a dangerous tool.
- open a file from preview.
- delete a conversation with active or queued work and verify its run, queue, and checkpoint are removed first.
- run mutating tools from concurrent conversations and verify mutations remain serialized within the same workspace.

## API validation

Review [Official DeepSeek references](../deepseek-api/Official-References.md) when changing:

- models.
- chat parameters.
- streaming.
- thinking mode.
- JSON output.
- tool calls.
- FIM.
- HTTP errors.

## Technical documentation validation

- local Markdown links resolve.
- documented paths and message names match the current source tree.
- related documentation changes ship in the same commit as code changes.

[Back](INDEX.md)
