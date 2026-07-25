> Target date: **2026-08-25**

## Context

Conversation schema v2 temporarily accepts and migrates unversioned chat files. During extension activation, valid legacy files are atomically rewritten to schema v2 and the replacement is verified before the legacy representation is considered removed.

This compatibility code is intentionally temporary. The target date is a maintenance reminder only: there is no runtime migration window or date-based cutoff. Legacy conversations remain migratable until this cleanup is released.

## Objective

Remove all legacy conversation compatibility and leave schema v2 as the only accepted and written format.

## To-Do List

- [ ] Make `Conversation.schemaVersion: 2` required at the type level.
- [ ] Remove activation-time legacy history migration.
- [ ] Reject or isolate unversioned conversation files.
- [ ] Remove legacy fixtures and migration-only tests.
- [ ] Remove obsolete migration documentation and comments.

## Acceptance Criteria

- [ ] Production code contains no legacy conversation parser or migration branch.
- [ ] Every saved and loaded conversation requires `schemaVersion: 2`.
- [ ] TypeScript, lint, unit tests, integration tests, and production builds pass.
- [ ] The packaged extension contains no migration-only code.
