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

## To-Do List

- [ ] Complete issue draft 020 first so rejected and executed paths can be compared with provider-reported usage.
- [ ] Recognize exact, finite version/help/availability diagnostics locally, including safe chains whose individual segments are allowlisted. Execute them without a security-model call or revision result.
- [ ] Replace verbose model-facing rejection prose with a compact structured result code and minimal replanning constraint; keep explanatory UI copy local.
- [ ] Record the content hash and generation provenance of scripts created or modified through workspace tools.
- [ ] Before executing a workspace script, verify that the path is inside the bound workspace, the current hash matches the reviewed hash, and every approved capability remains within an explicit effect profile.
- [ ] Introduce a bounded way to approve common generated test harnesses when their effects are objectively established, including localhost-only HTTP, a concretely owned child process, finite timeout, exact-process cleanup, and workspace-contained artifacts.
- [ ] Treat process-scoped `-ExecutionPolicy Bypass` differently from a command that changes machine/user execution policy; the flag alone must not imply elevation.
- [ ] Do not approve an arbitrary script merely because the agent created it. Unknown imports, dynamic evaluation, external network access, global process termination, credentials, external paths, or unverified effects must still require confirmation.
- [ ] Cache a positive deterministic/reviewer decision only by conversation, workspace binding, normalized command, script/content hashes, permission fingerprint, and effect profile. Invalidate it on any change.
- [ ] Make the auto-approve contract explicit: verified workspace-contained effects continue automatically; non-delegable and unverified effects stop.

- [ ] `dotnet --version && node --version && npm --version` executes as a local read-only diagnostic and does not call the security reviewer.
- [ ] A diagnostic result is cheaper in measured provider tokens than the former reject-and-replan path.
- [ ] The safe hashed smoke-test fixture runs unattended in auto-approve mode.
- [ ] Editing the script after review invalidates its approval before execution.
- [ ] Remote destinations, external filesystem paths, broad process termination, and unbounded background processes remain non-delegable or require confirmation.
- [ ] Decisions are based on parsed facts and hashes, not a DeepSeek assertion.
- [ ] Tests cover CMD, PowerShell, and POSIX quoting and prevent compound-command parsing from turning mutation into a read-only false negative.
