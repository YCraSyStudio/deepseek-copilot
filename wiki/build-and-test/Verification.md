[Back](INDEX.md)

# Verification

## Before closing code changes

Run:

```bash
npm run compile
npm run lint
npm run build
npm run test:unit
npm run test:integration
git diff --check
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
- type `./` in the chat input and select a suggested path; verify `../` never opens autocomplete and is rejected if sent manually.
- execute a safe tool.
- confirm or cancel a dangerous tool.
- open a file from preview.
- delete a conversation with active or queued work and verify its run, queue, and checkpoint are removed first.
- run mutating tools from concurrent conversations and verify mutations remain serialized within the same workspace.
- verify the API-key preview appears as the input placeholder on first open.
- verify auto-approve performs local analysis, remote review, rejection guidance,
  and manual fallback without losing a generation round.
- verify grouped activity remains compact until expanded.
- verify “Open file” opens the affected file and a file mutation opens the
  specific change diff.
- verify confirmation panels fit narrow sidebars and use the available width in
  wide views.

## Test layout

Unit tests are grouped under `src/test/chat`, `deepseek`, `tools`, `security`,
`storage`, `webview`, and `architecture`. The unit runner discovers tests
recursively and explicitly excludes `src/test/integration`; VS Code integration
tests use their own build and runner.

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
