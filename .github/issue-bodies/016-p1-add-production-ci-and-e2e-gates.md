> Priority: **P1 — required before release candidate**

## Context

The project currently has no GitHub Actions workflow. Local compile, lint, build, 67 unit tests, and the minimal integration test pass against the default downloaded VS Code version.

However, the only extension-host integration test activates the extension and checks command registration. It does not pin or cover the minimum declared VS Code version, open the webview, exercise settings/history/tools, install the produced VSIX, or cover Linux and macOS.

Relevant code:

- `package.json`
- `src/test/Extension.test.ts`
- `scripts/run-unit-tests.mjs`
- `.github/`

## Objective

Create an automated release gate that exercises supported operating systems, VS Code versions, packaged artifacts, and the production-critical workflows identified in the audit.

## To-Do List

- [ ] Add CI jobs for compile, lint, unit tests, build, and dependency audit.
- [ ] Run extension-host tests on Windows, Linux, and macOS.
- [ ] Test the minimum supported VS Code version and the latest stable version.
- [ ] Align `@types/node` with the Node runtime shipped by the minimum supported VS Code host.
- [ ] Add integration helpers for resolving and messaging the real webview.
- [ ] Add E2E coverage for generation lifecycle, settings permissions, history, tools, cancellation, and multi-root behavior.
- [ ] Package the VSIX in CI and install that exact artifact into a clean test instance.
- [ ] Verify expected VSIX contents and absence of excluded files.
- [ ] Run runtime and build-chain vulnerability checks with an explicit severity policy.
- [ ] Upload test reports, logs, VSIX checksum, and packaged artifact for review.
- [ ] Make the workflow a required check before stable-release publication.

## Acceptance Criteria

- [ ] Every supported OS runs automated extension-host coverage.
- [ ] Both minimum and latest VS Code versions receive at least activation and packaged-VSIX smoke coverage.
- [ ] Production-critical P0/P1 regression tests run in CI.
- [ ] The tested and published VSIX can be proven to be the same artifact.
- [ ] CI blocks release on compile, lint, test, packaging, or agreed vulnerability-policy failure.

## Regression Tests

- [ ] Webview resolve, configuration load, send, stream, cancel, and reload.
- [ ] Multi-root selection and historical conversation from a closed workspace.
- [ ] Tool confirmation, auto-approved tool, failure, cancellation, and duplicate IDs.
- [ ] History disabled, retention, delete/undo, and concurrent-window storage simulations.
- [ ] Windows content search and cross-platform process termination.
- [ ] Install and activate the packaged VSIX with no repository `node_modules`.
