> Priority: **P1 — required before release candidate**

## Context

The tool-call pipeline does not currently guarantee unique, non-empty provider IDs. Pending calls and UI state are keyed by those IDs, so duplicates can share one resolver and one approval action.

Tool handlers also return a mix of structured results, thrown errors, and plain strings beginning with `Error`. Only a subset is recognized as failure, allowing rejected writes or patches to appear as `completed`.

Finally, cancelling or failing after a tool has produced side effects can remove the conversation turn without reverting the side effects or preserving an audit record.

Relevant code:

- `src/deepseekApi/providers/deepseek/features/ChatResponseValidation.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/PendingCycle.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolExecution.ts`
- `src/core/tools/ToolExecutor.ts`
- `src/ui/hooks/chat/UseToolCallController.ts`

## Objective

Give every tool call an unambiguous identity, typed terminal outcome, and durable audit record whenever it may have changed external state.

## To-Do List

- [ ] Reject empty or duplicate provider tool-call IDs within a response.
- [ ] Introduce an internal ID scoped to generation, round, and call index.
- [ ] Key approvals, pending resolvers, UI rows, and stored executions by the internal identity.
- [ ] Replace string-based success/error inference with a shared typed result contract.
- [ ] Make every exit path terminalize pending/running calls as completed, rejected, cancelled, or error.
- [ ] Close confirmation and limit modals after every terminal generation outcome.
- [ ] Persist partial tool timelines when cancellation or failure occurs after possible side effects.
- [ ] Clearly distinguish “generation cancelled” from “tool effect rolled back”; do not imply rollback unless it happened.

## Acceptance Criteria

- [ ] One approval can release only the exact call shown to the user.
- [ ] No tool call remains pending or running after its generation ends.
- [ ] Failed file hashes, patches, commands, and validation checks are shown as errors.
- [ ] Side-effecting calls remain visible in conversation/history after later cancellation or API failure.
- [ ] Reloaded history normalizes interrupted calls without losing completed effects.

## Regression Tests

- [ ] Duplicate and empty tool-call IDs.
- [ ] Parallel tool calls with out-of-order completion.
- [ ] Failure before execution, during execution, and after one successful side effect.
- [ ] Cancellation while pending confirmation, running, and after completion.
- [ ] UI modal and timeline cleanup for every terminal state.
