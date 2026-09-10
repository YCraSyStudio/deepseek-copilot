import type { CommandFacts } from "./CommandFacts";
import type { ScriptEffectProfile } from "./ScriptEffects";

/**
 * Deterministic approval rules.
 *
 * Each rule answers a single question with machine-verifiable facts: is this
 * action provably bounded? When any fact is missing, unknown, or outside the
 * stated boundary the verdict is `review`, which keeps the existing
 * model-based safety review in the loop.
 */

type ApprovalCode =
  | "workspace-file-mutation"
  | "read-only-diagnostic"
  | "verified-workspace-script"
  | "cached-positive-decision";

interface ApprovalVerdict {
  kind: "approve";
  code: ApprovalCode;
  facts: Record<string, unknown>;
}

interface ReviewVerdict {
  kind: "review";
  code: string;
  facts: Record<string, unknown>;
}

export type SafetyVerdict = ApprovalVerdict | ReviewVerdict;

const FILE_MUTATION_TOOLS = new Set(["create_file", "edit_file", "apply_patch"]);

export interface FileMutationFacts {
  toolName: string;
  /** Declared tool effect from the registry. */
  effect?: string;
  /** Result of the workspace containment check performed by the host. */
  workspaceContained?: boolean;
  reasonCode?: string;
  filePath?: string;
  sensitivePath: boolean;
}

/**
 * A file mutation that the host proved inside the bound workspace only touches
 * project files. The payload is irrelevant to safety, so no model review round
 * can add information here.
 */
export function approveWorkspaceFileMutation(facts: FileMutationFacts): SafetyVerdict {
  const evidence: Record<string, unknown> = {
    toolName: facts.toolName,
    effect: facts.effect,
    workspaceContained: facts.workspaceContained,
    reasonCode: facts.reasonCode,
    filePath: facts.filePath,
    sensitivePath: facts.sensitivePath,
  };
  if (!FILE_MUTATION_TOOLS.has(facts.toolName)) {
    return review("not-a-file-mutation", evidence);
  }
  if (facts.effect !== "workspace-mutation") {
    return review("unexpected-effect", evidence);
  }
  if (facts.reasonCode === "outside-workspace") {
    return review("outside-workspace", evidence);
  }
  if (facts.workspaceContained !== true) {
    return review("containment-unknown", evidence);
  }
  if (!facts.filePath) {
    return review("path-unknown", evidence);
  }
  if (facts.sensitivePath) {
    return review("sensitive-path", evidence);
  }
  return {
    kind: "approve",
    code: "workspace-file-mutation",
    facts: { toolName: facts.toolName, filePath: facts.filePath },
  };
}

/**
 * Version, help, and availability queries are finite read-only diagnostics.
 * The command parser already proved every segment is allowlisted, so asking a
 * model costs a round without adding a fact.
 */
export function approveReadOnlyDiagnostic(facts: CommandFacts): SafetyVerdict {
  if (facts.classification !== "read-only-diagnostic") {
    return review("not-a-read-only-diagnostic", { classification: facts.classification });
  }
  if (facts.escalatesPrivileges) {
    return review("privilege-escalation", { programs: facts.programs });
  }
  if (facts.changesExecutionPolicy) {
    return review("execution-policy-change", { segments: facts.segments });
  }
  return {
    kind: "approve",
    code: "read-only-diagnostic",
    facts: { programs: facts.programs, segments: facts.segments },
  };
}

export type ScriptProvenance = "agent-authored" | "changed" | "unknown";

export interface ScriptExecutionFacts {
  facts: CommandFacts;
  /** True when the script path resolves inside the bound workspace. */
  contained: boolean;
  /** Whether the on-disk content still matches what the agent wrote. */
  provenance: ScriptProvenance;
  profile: ScriptEffectProfile;
  hash?: string;
}

/**
 * Runs a workspace script unattended only when four independent facts agree:
 * the command is a single script invocation, the script lives inside the
 * workspace, its content still matches the agent-authored bytes, and its
 * declared effects stay inside the bounded profile.
 */
export function approveVerifiedWorkspaceScript(input: ScriptExecutionFacts): SafetyVerdict {
  const facts: Record<string, unknown> = {
    script: input.facts.script?.path,
    language: input.facts.script?.language,
    hash: input.hash,
    capabilities: input.profile.capabilities,
    blockedBy: input.profile.blockedBy,
  };
  if (input.facts.classification !== "script-execution" || !input.facts.script) {
    return review("not-a-script-execution", facts);
  }
  if (input.facts.escalatesPrivileges) {
    return review("privilege-escalation", facts);
  }
  if (input.facts.changesExecutionPolicy) {
    return review("execution-policy-change", facts);
  }
  if (!input.contained) {
    return review("outside-workspace", facts);
  }
  if (input.provenance !== "agent-authored") {
    return review(`provenance-${input.provenance}`, facts);
  }
  if (!input.profile.bounded) {
    return review("unbounded-effects", facts);
  }
  return { kind: "approve", code: "verified-workspace-script", facts };
}

function review(code: string, facts: Record<string, unknown>): ReviewVerdict {
  return { kind: "review", code, facts };
}
