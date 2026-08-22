[Back](INDEX.md)

# Safety and Confirmations

## Modes

The extension exposes every runtime-available tool and uses three permission modes:

- `default` asks before every tool call.
- `auto-approve` runs routine operations automatically inside or outside the workspace. Elevated and critical operations require confirmation.
- `full-access` runs routine and elevated operations automatically anywhere. It asks only for critical actions that could make the computer unusable or cause broad irreversible loss.

There is no per-tool permission matrix. Web search is the single capability toggle: disabling it removes both `search_web` and `read_web` from the definitions sent to DeepSeek.

VS Code Workspace Trust remains authoritative. An untrusted workspace captures a `default` permission snapshot and rejects mutating tools until the workspace is trusted.

## Independent DeepSeek review

Terminal commands and file mutations in automatic modes are prepared without a local danger classifier and sent to a separate DeepSeek review request. The reviewer receives the original user request, the proposed command or a content-free file-operation description, mechanical path/shell facts, and bounded non-sensitive context for explicitly named workspace files.

The reviewer returns:

- `decision`: `approve`, `revise`, or `manual_confirmation`;
- `risk`: `routine`, `elevated`, or `critical`;
- `confidence`: from `very_low` through `very_high`;
- a concise reason or replanning constraint.

Automatic approval or revision requires `medium_high` confidence or above. Invalid, unavailable, or ambiguous reviews fail closed to manual confirmation. Commands that visibly contain credentials are not transmitted to the reviewer.

## Confirmation behavior

When the active mode requires confirmation:

1. the backend sends `toolCallConfirmationRequired` with the exact command or affected path and the DeepSeek classification;
2. the UI offers execute once or cancel;
3. the backend accepts the response only for the pending `generationId` and `toolCallId`;
4. the approved operation is revalidated immediately before execution, including optimistic file hashes when available.

Confirmations are never remembered for the session. Every later mutation receives a fresh independent classification, so a previous approval cannot bypass a critical decision.

Terminal commands remain finite, non-interactive, cancellable, and outside an OS sandbox. Mechanical validation, workspace binding, schema validation, mutation serialization, output bounds, and process-tree cancellation remain local enforcement rather than risk classification.

[Back](INDEX.md)
