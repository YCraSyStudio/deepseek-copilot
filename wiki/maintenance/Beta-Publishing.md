[Back](INDEX.md)

# Release Channels and Publishing

## Versioning policy

`0.1.12` is the final **Public Preview** release. It keeps `preview: true` and is published through the normal Marketplace release channel, matching the historical `0.1.x` behavior.

Starting after `0.1.12`, the extension uses VS Code's two Marketplace channels instead of the `preview` gallery flag:

- **Stable channel:** even minor versions (`0.2.x`, `0.4.x`, `0.6.x`, ...).
- **Pre-release channel:** odd minor versions (`0.3.x`, `0.5.x`, `0.7.x`, ...), published with `vsce --pre-release`.
- New release lines start at patch `.0`. Patch increments are reserved for fixes or incremental builds within the same line.
- `preview` must be `false` for both stable and pre-release builds after `0.1.12`; channel selection is handled by the Marketplace pre-release flag.

The first stable release is therefore `0.2.0`. The next development line is `0.3.0` on the pre-release channel. When the `0.3.x` work is ready for stable users, it is promoted as `0.4.0`, not as `0.2.x`. This keeps the stable release numerically newer than every pre-release build that preceded it.

Example lifecycle:

```text
0.1.12  Public Preview, final legacy preview release
   ↓
0.2.0   Stable
0.2.1   Stable hotfix
   │
   └──── 0.3.0  Pre-release
         0.3.1  Pre-release update
         0.3.2  Pre-release update
            ↓ promote
0.4.0   Stable
0.4.1   Stable hotfix
   │
   └──── 0.5.0  Next pre-release line
            ↓ promote
0.6.0   Stable
```

Do not use SemVer suffixes such as `-beta.1` or `-preview.1` for Marketplace package versions. The version number and Marketplace channel together identify release stability.

## Target release

For the current branch, `0.1.12` is the final preview target. Keep `package.json` and the root lockfile aligned to `0.1.12` until that release is cut.

After `0.1.12`:

- stable releases use an even minor version and the normal Marketplace channel;
- pre-release builds use the following odd minor version and the Marketplace pre-release channel;
- a pre-release line is promoted by advancing to the next even minor version.

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
npx @vscode/vsce package --no-dependencies
```

Do not use the deprecated `vsce` package. Older versions still require explicit `activationEvents`; modern VS Code generates activation events from contribution declarations.

## Marketplace publishing

### Final Public Preview: 0.1.12

`0.1.12` is published through the normal release channel while retaining `preview: true` in `package.json`.

```bash
npx @vscode/vsce publish
```

### Stable channel

Even-minor versions are published normally:

```bash
# Example: 0.2.0, 0.2.1, 0.4.0
npx @vscode/vsce publish
```

### Pre-release channel

Odd-minor versions are published explicitly to VS Code's pre-release channel:

```bash
# Example: 0.3.0, 0.3.1, 0.5.0
npx @vscode/vsce publish --pre-release
```

A pre-release build must never be republished as stable with the same version number. Promotion always advances to the next even minor version.

## GitHub release

Before creating the extension tag, publish the immutable SearXNG sidecar release from the exact `main` commit intended for `0.1.12`:

```bash
gh workflow run searxng-runtime.yml --ref main
gh run list --workflow searxng-runtime.yml --limit 1
gh run watch <run-id> --exit-status
npm run verify:searxng-runtime
```

The runtime workflow reads the `v2` metadata pinned in the extension, builds and smoke-tests all five supported binaries, verifies their sizes and SHA-256 digests against the VSIX trust anchor, and creates the prerelease atomically. It refuses to modify an existing runtime release.

Push a `vX.Y.Z` tag after `main` points at the release commit:

```bash
git tag v0.1.12
git push origin v0.1.12
```

The production workflow must validate the tag against `package.json`, extract the matching section from `CHANGELOG.md`, wait for quality, extension-host, and packaged-VSIX smoke gates, verify `sha256.txt`, and publish the verified VSIX and checksum.

GitHub release status mirrors the Marketplace channel:

- even-minor stable releases are normal GitHub releases;
- odd-minor Marketplace pre-releases are GitHub prereleases;
- `0.1.12` remains a GitHub prerelease because it is the final Public Preview build.

Publish only after installing the packaged VSIX in a clean profile and testing an upgrade from the previous Marketplace release.

## Manual release validation

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
- Cancel generation and verify the terminal `cancelled` turn retains the prompt, partial response, reasoning, and completed tool results without rolling back side effects.
- Attach an image and a context file through the same picker, paste an image with `Ctrl+V`/`Cmd+V`, and verify removal and preview rendering.
- Verify V4 Vision reads attached file IDs directly and V4 Pro invokes `analyze_images` only when images are present.
- Close and reopen VS Code during active and queued work; verify partial output is saved and queued prompts appear as recoverable drafts.
- Open a file from a tool result.
- Verify Settings tooltips and select controls render correctly.
- Enable Incognito mode, verify the chat survives in memory without history/checkpoints, then test both explicit save and discard transitions.
- Enable the usage breakdown and verify request/report coverage, reasoning, cache hit/miss, conversation totals, and official V4 cost estimates after a normal and a tool-assisted generation.
- Verify custom API origins do not receive DeepSeek-specific `stream_options` automatically and never show an estimated currency.
- Verify SearXNG starts automatically, exposes its engine catalog, respects custom engine selection, and performs `search_web` without requiring Chromium, Docker, Podman, or a system Python installation.
- Open Diagnostics and verify generation/conversation usage summaries contain counts and phases but no prompt, response, command, or path content.

## Known constraints

- DeepSeek is the only AI provider.
- At most one generation runs per conversation; the global concurrent-generation limit is configurable from 1 to 16.
- Tool execution is workspace-sensitive and should be reviewed before auto approval.
- The webview tooltip system mimics VS Code theme variables but cannot invoke native VS Code hover widgets directly.
- Explorer clipboard URI access is not used; workspace references use path autocomplete or the unified picker. Clipboard image data is supported separately through bounded webview IPC.

[Back](INDEX.md)
