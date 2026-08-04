## Context

The repository already contains the production workflow, quality checks, cross-platform extension-host matrix, installed-VSIX smoke tests, artifact checksum generation, and regression coverage. The remaining work requires GitHub repository administration and evidence from an actual remote workflow run.

## Objective

Make the existing production workflow an enforced release gate and prove that the exact release-candidate VSIX passes every required job.

## To-Do List

- [ ] Push the workflow and observe every matrix job passing in GitHub Actions.
- [ ] Mark `Quality, security, and VSIX`, all six `Extension host` jobs, and both `Installed VSIX smoke` jobs as required branch-protection checks.
- [ ] Record the successful workflow URL and artifact SHA-256 in the release candidate.
- [ ] Download the release-candidate VSIX and verify that its checksum matches `sha256.txt` from the same workflow.
- [ ] Confirm branch protection prevents merging or publishing while any required job is skipped, neutral, cancelled, or failing.
- [ ] Do not publish a stable artifact until every required check succeeds for the release commit.
