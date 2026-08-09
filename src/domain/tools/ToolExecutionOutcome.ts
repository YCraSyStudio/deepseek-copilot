export type ToolExecutionOutcome =
  | { kind: "completed"; content: string }
  | { kind: "error"; content: string }
  | { kind: "rejected"; content: string }
  | { kind: "cancelled"; content: string }
  | { kind: "skipped"; content: string }
  | {
      kind: "confirmation_required";
      content: string;
      dangerLevel: "safe" | "caution" | "dangerous" | "destructive";
    };

export function serializeToolExecutionOutcome(outcome: ToolExecutionOutcome): string {
  return outcome.content;
}

export function isFailedToolExecutionOutcome(outcome: ToolExecutionOutcome): boolean {
  return outcome.kind === "error";
}
