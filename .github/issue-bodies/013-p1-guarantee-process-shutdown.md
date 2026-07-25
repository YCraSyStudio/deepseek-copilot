> Priority: **P1 — required before release candidate**

## Context

Command timeout currently sends one termination request and waits for the child `close` event. On POSIX, a process group that ignores `SIGTERM` can keep the promise pending indefinitely. On cancellation, the promise rejects before process death is guaranteed, allowing a detached command to continue changing the system.

Windows termination uses a synchronous `taskkill` call without its own timeout, and active child processes are not centrally disposed when the extension host stops.

Relevant code:

- `src/core/tools/definitions/ShellExecution.ts`
- `src/extension/lifecycle/Deactivate.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/test/ShellExecution.test.ts`

## Objective

Guarantee bounded command settlement and best-effort process-tree cleanup for timeout, cancellation, webview disposal, and extension shutdown.

## To-Do List

- [ ] Maintain a registry of active child processes owned by the extension.
- [ ] On POSIX, send `SIGTERM` to the process group and escalate to `SIGKILL` after a short grace period.
- [ ] Add a hard settlement deadline even if no `close` event arrives.
- [ ] Make Windows tree termination asynchronous and independently bounded.
- [ ] Record whether termination was confirmed or may have left a process alive.
- [ ] Dispose all registered processes during deactivation and active-generation teardown.
- [ ] Handle spawn errors, missing PIDs, already-exited children, and signal races idempotently.

## Acceptance Criteria

- [ ] `timeoutMs` is a real upper bound plus a documented short kill grace period.
- [ ] Cancellation does not report completion while a known child process is still running.
- [ ] Extension shutdown attempts to terminate every owned process tree.
- [ ] No blocking process-management call can freeze the extension host indefinitely.

## Regression Tests

- [ ] Cooperative child, child that ignores graceful termination, and child with descendants.
- [ ] Cancellation before spawn, immediately after spawn, and during output.
- [ ] Timeout/cancel race and process exit during escalation.
- [ ] Windows and POSIX-specific process-tree tests in CI.
