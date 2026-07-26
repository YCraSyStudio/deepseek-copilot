# Production-readiness issue body files

These drafts convert the production audit into reviewable GitHub issues. No issue has been created remotely.

Each Markdown file contains only the issue body. Titles, suggested existing labels, priority, and dependencies are recorded in `manifest.json`.

## Priority policy

- **P0:** stable release blocker. Do not remove the Marketplace preview flag while any P0 remains open.
- **P1:** required before the first stable release candidate.
- **P2:** release hardening that should be completed before or immediately alongside the stable release.

## Backlog

| ID | Priority | Title | Body file | Suggested labels | Depends on |
| --- | --- | --- | --- | --- | --- |
| 007 | P0 | Keep API credentials host-side and bind them to secure origins | `007-p0-protect-api-credentials.md` | BUG, INTEGRATION, FRONTEND | — |
| 008 | P0 | Make disabled history truly ephemeral | `008-p0-make-disabled-history-ephemeral.md` | BUG, INTEGRATION, FRONTEND | — |
| 009 | P1 | Guarantee tool-call identity, terminal states, and auditability | `009-p1-tool-call-integrity-and-audit.md` | BUG, INTEGRATION, FRONTEND | — |
| 010 | P1 | Prevent file tools from overwriting unsaved editor buffers | `010-p1-protect-unsaved-editor-buffers.md` | BUG, INTEGRATION | — |
| 011 | P1 | Make settings and history storage concurrency-safe | `011-p1-make-storage-concurrency-safe.md` | BUG, INTEGRATION | — |
| 012 | P1 | Harden streaming timeouts, bounds, and partial-response recovery | `012-p1-harden-streaming-resilience.md` | BUG, INTEGRATION, FRONTEND | — |
| 013 | P1 | Guarantee child-process shutdown on timeout and cancellation | `013-p1-guarantee-process-shutdown.md` | BUG, INTEGRATION | — |
| 014 | P1 | Version and synchronize the webview-host protocol | `014-p1-version-webview-host-protocol.md` | BUG, INTEGRATION, FRONTEND | 008 |
| 015 | P1 | Align DeepSeek provider options with the documented API contract | `015-p1-align-deepseek-provider-contract.md` | BUG, INTEGRATION | — |
| 016 | P1 | Add production CI, E2E coverage, and packaged-VSIX release gates | `016-p1-add-production-ci-and-e2e-gates.md` | IMPROVEMENT, INTEGRATION | — |
| 017 | P2 | Align the extension manifest, VSIX contents, and release metadata | `017-p2-fix-package-manifest-and-vsix.md` | BUG, INTEGRATION, DOCUMENTATION | 016 |
| 018 | P2 | Add managed, redacted production diagnostics | `018-p2-add-managed-redacted-diagnostics.md` | IMPROVEMENT, INTEGRATION | — |
| 019 | P1 | Remove temporary legacy conversation migration | `019-p1-remove-legacy-conversation-migration.md` | IMPROVEMENT, INTEGRATION | — |

Dependencies refer to draft IDs. Replace them with GitHub issue references after creation if desired.

Issue 019 is published as [GitHub issue #61](https://github.com/YarCrasy/deepseek-copilot/issues/61). Its `githubIssue` manifest field prevents the bulk example below from creating it again.

## Review

From PowerShell:

```powershell
$issueManifest = Get-Content -LiteralPath ".github/issue-bodies/manifest.json" -Raw | ConvertFrom-Json
$issueManifest.issues | Format-Table id, priority, title, bodyFile
```

Review every body before creating the corresponding issue:

```powershell
Get-Content -LiteralPath ".github/issue-bodies/007-p0-protect-api-credentials.md"
```

## Create one issue with GitHub CLI

Example for issue 007:

```powershell
gh issue create `
  --repo "YarCrasy/deepseek-copilot" `
  --title "[P0] Keep API credentials host-side and bind them to secure origins" `
  --label "BUG" `
  --label "INTEGRATION" `
  --body-file ".github/issue-bodies/007-p0-protect-api-credentials.md"
```

The repository currently has these relevant labels:

- `BUG`
- `FEATURE`
- `DOCUMENTATION`
- `IMPROVEMENT`
- `FRONTEND`
- `INTEGRATION`

## Optional bulk creation after review

The following intentionally creates every issue in `manifest.json`. Run it only after all bodies, titles, labels, and dependencies have been reviewed:

```powershell
$issueManifest = Get-Content -LiteralPath ".github/issue-bodies/manifest.json" -Raw | ConvertFrom-Json

foreach ($issue in $issueManifest.issues | Where-Object { -not $_.githubIssue }) {
  $ghArguments = @(
    "issue", "create",
    "--repo", $issueManifest.repository,
    "--title", $issue.title,
    "--body-file", $issue.bodyFile
  )

  foreach ($label in $issue.labels) {
    $ghArguments += @("--label", $label)
  }

  & gh @ghArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create draft issue $($issue.id)"
  }
}
```
