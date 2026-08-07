[Back](INDEX.md)

# Beta Publishing

## Target release

The current target is `0.1.7` pre-release. Use the version declared in
`package.json` and keep the root lockfile aligned.

## Marketplace metadata

- Publisher: `yarcrasy`
- Repository: `https://github.com/YarCrasy/deepseek-copilot`
- License: MIT
- Categories: `AI`, `Chat`
- Main entry: `dist/extension.js`
- Activity bar icon: `src/assets/DeepSeekIcon.svg`

## Required checks

Run from the repository root:

```bash
npm run compile
npm run lint
npm run build
npm test
```

Run the human documentation build:

```bash
cd web-doc
npm run build
```

The Astro build output is the repository root `docs/` folder. Configure GitHub Pages to serve from the main branch `/docs` folder.

Package the VSIX:

```bash
npx @vscode/vsce package --pre-release --no-dependencies
```

Do not use the deprecated `vsce` package. Older versions still require explicit `activationEvents`; modern VS Code generates activation events from contribution declarations.

## GitHub release

Push a `vX.Y.Z` tag after `main` points at the release commit:

```bash
git tag v0.1.7
git push origin v0.1.7
```

The production workflow validates the tag against `package.json`, extracts the matching section from `CHANGELOG.md`, waits for the quality, extension-host, and packaged-VSIX smoke gates, verifies `sha256.txt`, and creates a GitHub pre-release with the verified VSIX and checksum attached.

Publish only after installing the packaged VSIX in a clean profile and testing
an upgrade from `0.1.3`:

```bash
npx @vscode/vsce publish --pre-release
```

Marketplace pre-releases use ordinary `major.minor.patch` versions; SemVer
suffixes such as `-preview.1` are not supported. `preview: true` marks the
extension as a preview product but does not replace the `--pre-release` channel.

## Manual beta validation

- Open Extension Development Host.
- Open DeepSeek Copilot from the Activity Bar.
- Save and test a DeepSeek API key.
- Send a normal chat message.
- Send a prompt that needs a file and select a path through `./` autocomplete.
- Verify tool call confirmation, execution, and result rendering.
- Switch between Chat, History, and Settings while a tool call is pending.
- Queue a second prompt in the same conversation.
- Start another conversation and verify both generations can progress concurrently.
- Use Interrupt and guide and verify the guidance runs before older queued prompts.
- Cancel generation and verify the interrupted turn retains the prompt and any partial response.
- Close and reopen VS Code during active and queued work; verify partial output is saved and queued prompts appear as recoverable drafts.
- Open a file from a tool result.
- Verify Settings tooltips and select controls render correctly.
- Enable Incognito mode, verify the chat survives in memory without history/checkpoints, then test both explicit save and discard transitions.
- Enable the usage breakdown and verify request/report coverage, reasoning, cache hit/miss, conversation totals, and official V4 cost estimates after a normal and a tool-assisted generation.
- Verify custom API origins do not receive DeepSeek-specific `stream_options` automatically and never show an estimated currency.
- Trigger a low auxiliary-call warning budget and verify the warning is visible without interrupting the generation.
- Open Diagnostics and verify generation/conversation usage summaries contain counts and phases but no prompt, response, command, or path content.

## Known beta constraints

- DeepSeek is the only AI provider.
- At most one generation runs per conversation; the global concurrent-generation limit is configurable from 1 to 16.
- Tool execution is workspace-sensitive and should be reviewed before auto approval.
- The webview tooltip system mimics VS Code theme variables but cannot invoke native VS Code hover widgets directly.
- Explorer clipboard URI access is not used; workspace references are entered through path autocomplete.

[Back](INDEX.md)
