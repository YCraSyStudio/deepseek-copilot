# ADR 003: Generation state and events

Status: accepted

A generation uses explicit domain states and the pure `transitionGenerationState` function. Invalid transitions throw instead of silently corrupting recovery state.

Application work publishes discriminated serializable events through `GenerationEventSink`. UI delivery, checkpointing, and persistence are subscribers/adapters; a `vscode.WebviewView` is not used as an internal event bus. Checkpoint state and UI protocol DTOs remain separate from private DeepSeek transport models.

VS Code handlers validate and dispatch commands, invoke the relevant use case, and translate results. They must not own provider transport logic or generation invariants.

Every accepted generation emits exactly one terminal outcome. `completed`, `cancelled`, `interrupted`, and `error` are distinct states: explicit Stop preserves the current presentation turn as `cancelled`, while steering and recoverable lifecycle interruption use `interrupted`. Steering additionally carries a verified source-generation link; only a matching persisted `steered` terminal can inject continuation semantics into the next provider request. The UI hides that internal boundary, while other interruptions remain visible. Terminal publication occurs only after persistence reconciliation, and repeated or stale cancellation is idempotent.

