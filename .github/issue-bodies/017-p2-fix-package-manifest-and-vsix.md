## Context

The repository implementation now declares workspace capabilities, packages production webview assets without `node_modules`, enforces an allowlisted VSIX, aligns Node runtime types, and passes local installation/activation smoke testing. Stable publication and external consistency checks remain outstanding.

## Objective

Publish one CI-built, verified stable artifact whose Marketplace, GitHub, documentation, metadata, workspace behavior, and checksum all agree.

## To-Do List

- [ ] Complete issue drafts 016, 020, 021, and 023 before stable publication.
- [ ] Verify the CI-built VSIX in local, untrusted, multi-root, and virtual workspaces and attach the results to the release candidate.
- [ ] Choose and commit the stable version and update changelog and website translations.
- [ ] Remove `preview: true` only after every production and P1 gate passes.
- [ ] Publish the exact CI artifact to Marketplace and a prerelease GitHub release without rebuilding it locally.
- [ ] Verify Marketplace and GitHub downloads against the CI SHA-256 and record both checksums.
- [ ] Confirm Marketplace, GitHub release, README, website, changelog, and package manifest show the same stable version and status.
- [ ] Confirm unsupported virtual-workspace and Restricted Mode behavior matches the manifest declarations.
