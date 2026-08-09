# ADR 002: Persistence versioning and migration

Status: accepted

Stored conversations use `schemaVersion: 2`. Writes are atomic and guarded by the existing locks. Invalid data is isolated rather than partially interpreted.

For the compatibility window tracked by [issue #61](https://github.com/YCraSyStudio/deepseek-copilot/issues/61), valid unversioned conversations are migrated atomically before normal validation. The migrated file is reread and validated before legacy state is removed. This compatibility is a release property, not a runtime date check.

The migrator must remain in every release published on or before 25 August 2026. Its removal, fixtures, and obsolete re-exports form an isolated release change after that date; phase 7 must not be combined with functional work.

