> Priority: **P2 — release hardening**

## Context

The current manifest and package contents have several mismatches:

- virtual workspaces are considered supported by default, but the extension depends on local filesystem paths and child processes;
- Workspace Trust behavior is left implicit;
- the webview constructs a codicon font URI under `node_modules`, which is excluded from the VSIX;
- `.vscodeignore` excludes `deepseek-copilot.wiki/**`, but the packaged directory is `wiki/**`;
- published documentation still contains preview-era or inaccurate behavior descriptions;
- publishing documentation names `YCraSyStudio` while the manifest publisher is `yarcrasy`;
- the full development dependency audit reports `fast-uri@3.1.3` (GHSA-v2hh-gcrm-f6hx) through the `@vscode/vsce` build chain, while the production-only audit is clean.

Relevant code:

- `package.json`
- `.vscodeignore`
- `src/vscodeApi/webviews/WebviewProvider.ts`
- `src/vscodeApi/webviews/utils/HtmlRenderer.ts`
- `README.md`
- `wiki/`
- `web-doc/`
- `package-lock.json`

## Objective

Make the manifest, documentation, dependency set, and VSIX contents accurately describe and support the production extension.

## To-Do List

- [ ] Declare `capabilities.virtualWorkspaces` as unsupported or limited until non-file workspaces are implemented.
- [ ] Declare `capabilities.untrustedWorkspaces` explicitly with the intended Restricted Mode behavior.
- [ ] Remove the dead `node_modules` codicon URI or reference the bundled Vite asset.
- [ ] Correct `.vscodeignore` so unintended wiki/source content is excluded.
- [ ] Add an allowlist-style VSIX contents assertion to CI.
- [ ] Fix the high-severity development dependency advisory and refresh the lockfile.
- [ ] Align Node type definitions with the minimum VS Code extension-host runtime.
- [ ] Correct README claims about folder attachments, global history, permission behavior, and release status.
- [ ] Correct publisher-name drift in `wiki/maintenance/Beta-Publishing.md`.
- [ ] Update website/wiki/changelog content to the current released version.
- [ ] Remove `preview: true` only after every stable-release gate is satisfied.
- [ ] Publish the stable GitHub release as non-prerelease using the CI-tested artifact.

## Acceptance Criteria

- [ ] VS Code does not activate unsupported tool functionality in virtual workspaces.
- [ ] Restricted Mode behavior is explicit in the Marketplace manifest.
- [ ] The packaged webview loads fonts/assets without missing-resource requests.
- [ ] The VSIX contains only intentional runtime files.
- [ ] Runtime and build dependency audits meet the agreed release policy.
- [ ] Marketplace, GitHub release, README, website, and changelog report consistent version/status information.

## Verification

- [ ] Run `vsce ls --tree` and compare it to the committed content assertion.
- [ ] Install the VSIX with repository dependencies absent and inspect webview network/resource errors.
- [ ] Open local, untrusted, multi-root, and virtual workspaces and verify declared behavior.
- [ ] Verify published artifact checksum against the CI artifact.
