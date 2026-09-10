## Context

The safety pipeline treats exact prerequisite version queries as commands to revise after the agent has already requested them. That replaces a tiny read-only result with a longer rejection and forces another primary-model round.

It also loses useful provenance for workspace scripts. For example, an unchanged `test-api.ps1` created during the active generation, limited to localhost, starting one owned child process and stopping that exact process in `finally`, is presented as arbitrary PowerShell and blocks an auto-approved run with manual confirmation. Sending the script to a reviewer is not sufficient if the reviewer lacks machine-verifiable effect facts.

The regression scenario is the generated ASP.NET/Astro smoke-test flow that invokes:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File test-api.ps1
```

The safe fixture starts the requested API, waits for localhost readiness, performs bounded API checks, and terminates only its own child in `finally`. A one-line change to contact a remote host or kill processes by name must invalidate approval and require confirmation.

## Objective

Eliminate avoidable security-model calls and false confirmations when safety can be established from deterministic parsing, content hashes, workspace containment, and a bounded effect profile.

## Implementation status (0.1.14)

Shipped in `src/infrastructure/tools/safety/` and wired as a `deterministic_safety` stage that runs after the pending confirmation is prepared and before `remote_review`:

- `CommandFacts.ts` parses a command into segments and programs, classifies finite version/help/availability diagnostics against an allowlist, detects single script invocations (`-File`, POSIX/Node/Python operands), and reports process-scoped `-ExecutionPolicy Bypass` separately from a machine policy change and from privilege escalation. Pipes, redirects, substitutions, variables, and inline-code flags (`-e`, `-c`, `-Command`) force `unknown`.
- `ScriptEffects.ts` produces a bounded/unbounded effect profile from the script body: denied capabilities (dynamic evaluation, download-and-execute, machine policy change, broad process termination, escalation, interactive input, credentials, external absolute paths, background jobs) plus a localhost-only network check against the workspace root.
- `DeterministicApproval.ts` holds the three approval rules; every missing or unknown fact returns `review`, so the existing model review still runs.
- `DecisionCache.ts` keys a positive decision by conversation, workspace binding, permission fingerprint, tool, normalized subject, content hash, and effect profile; incomplete scopes are not cacheable.
- The platform glue (`DeterministicSafety.ts`) collects containment, provenance (current bytes must match a session-recorded agent write), and profile facts, and fails closed on any error.
- The reviewer now receives the body of a script referenced by the command (`CommandFileContext`), so it reviews effects instead of an opaque interpreter invocation.
- Model-facing rejections are one compact line with the reviewer constraint; the UI keeps its own copy.
- `ToolExecutionContext` carries `conversationId` and `permissionFingerprint` for decision scoping.

Pending: the two call sites inside `ToolExecution.ts` (caching a positive reviewer decision and the compact rejection text) still need their local `rememberPositiveDecision` helper and the shortened rejection string. Until that helper exists the file does not type-check and `npm run test:unit` reports three `ReferenceError: rememberPositiveDecision is not defined` failures in `ApproveForMe.test.ts`; the editor guard refused further mutations of that path in the session that produced them.

Tests: `src/test/security/CommandFacts.test.ts`, `ScriptEffects.test.ts`, `DeterministicApproval.test.ts`, and the extended `ApproveForMe.test.ts` cover diagnostics, quoting (CMD, PowerShell, POSIX), script provenance, escalation, policy scope, cache keys, and the pipeline behaviour in every permission mode.

## To-Do List

- [ ] Compare rejected and executed paths with provider-reported usage using the built-in usage telemetry (the per-phase panel already reports `security_review` cost; the before/after comparison for this issue is still pending).
- [x] Recognize exact, finite version/help/availability diagnostics locally, including safe chains whose individual segments are allowlisted. Execute them without a security-model call or revision result.
- [ ] Replace verbose model-facing rejection prose with a compact structured result code and minimal replanning constraint; keep explanatory UI copy local. (Code path identified; the one-line change is blocked on the same edit as the caching helper.)
- [x] Record the content hash and generation provenance of scripts created or modified through workspace tools. (Hash and session provenance are recorded; the generation id is not stored yet.)
- [x] Before executing a workspace script, verify that the path is inside the bound workspace, the current hash matches the reviewed hash, and every approved capability remains within an explicit effect profile.
- [x] Introduce a bounded way to approve common generated test harnesses when their effects are objectively established, including localhost-only HTTP, a concretely owned child process, finite timeout, exact-process cleanup, and workspace-contained artifacts.
- [x] Treat process-scoped `-ExecutionPolicy Bypass` differently from a command that changes machine/user execution policy; the flag alone must not imply elevation.
- [x] Do not approve an arbitrary script merely because the agent created it. Unknown imports, dynamic evaluation, external network access, global process termination, credentials, external paths, or unverified effects must still require confirmation.
- [x] Cache a positive deterministic/reviewer decision only by conversation, workspace binding, normalized command, script/content hashes, permission fingerprint, and effect profile. Invalidate it on any change.
- [x] Make the auto-approve contract explicit: verified workspace-contained effects continue automatically; non-delegable and unverified effects stop.

## Acceptance criteria

- [x] `dotnet --version && node --version && npm --version` executes as a local read-only diagnostic and does not call the security reviewer.
- [ ] A diagnostic result is cheaper in measured provider tokens than the former reject-and-replan path. (The review request is skipped entirely, so it is strictly cheaper; the recorded measurement is still pending.)
- [ ] The safe hashed smoke-test fixture runs unattended in auto-approve mode. (The rule set and its unit fixtures pass; the end-to-end script run is still to be exercised.)
- [x] Editing the script after review invalidates its approval before execution.
- [x] Remote destinations, external filesystem paths, broad process termination, and unbounded background processes remain non-delegable or require confirmation.
- [x] Decisions are based on parsed facts and hashes, not a DeepSeek assertion.
- [x] Tests cover CMD, PowerShell, and POSIX quoting and prevent compound-command parsing from turning mutation into a read-only false negative.
