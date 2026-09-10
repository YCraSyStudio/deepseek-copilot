import * as assert from "node:assert";
import { parseCommandFacts } from "@/infrastructure/tools/safety/CommandFacts";
import {
  approveReadOnlyDiagnostic,
  approveVerifiedWorkspaceScript,
  approveWorkspaceFileMutation,
} from "@/infrastructure/tools/safety/DeterministicApproval";
import { createDecisionKey, isCacheableScope, PositiveDecisionCache } from "@/infrastructure/tools/safety/DecisionCache";

const BOUNDED_PROFILE = { bounded: true, capabilities: ["http-localhost"], blockedBy: [] };
const UNBOUNDED_PROFILE = { bounded: false, capabilities: [], blockedBy: ["non-local-network"] };

suite("deterministic approval rules", () => {
  test("approves a workspace-contained file mutation", () => {
    const verdict = approveWorkspaceFileMutation({
      toolName: "edit_file",
      effect: "workspace-mutation",
      workspaceContained: true,
      filePath: "src/app.ts",
      sensitivePath: false,
    });
    assert.strictEqual(verdict.kind, "approve");
  });

  test("keeps file mutations outside the workspace in review", () => {
    for (const facts of [
      { workspaceContained: true, reasonCode: "outside-workspace", filePath: "src/app.ts" },
      { workspaceContained: undefined, reasonCode: undefined, filePath: "src/app.ts" },
      { workspaceContained: true, reasonCode: undefined, filePath: undefined },
      { workspaceContained: true, reasonCode: undefined, filePath: "src/app.ts", sensitivePath: true },
      { workspaceContained: true, reasonCode: undefined, filePath: "src/app.ts", effect: "external-effect" },
    ]) {
      const verdict = approveWorkspaceFileMutation({
        toolName: "edit_file",
        effect: "workspace-mutation",
        sensitivePath: false,
        ...facts,
      });
      assert.strictEqual(verdict.kind, "review", JSON.stringify(facts));
    }
  });

  test("approves only finite version and help diagnostics", () => {
    assert.strictEqual(approveReadOnlyDiagnostic(parseCommandFacts("dotnet --version && npm --version")).kind, "approve");
    assert.strictEqual(approveReadOnlyDiagnostic(parseCommandFacts("rm -rf dist")).kind, "review");
    assert.strictEqual(approveReadOnlyDiagnostic(parseCommandFacts("Set-ExecutionPolicy Unrestricted")).kind, "review");
    assert.strictEqual(approveReadOnlyDiagnostic(parseCommandFacts("sudo node --version")).kind, "review");
  });

  test("runs a workspace script unattended only with every fact verified", () => {
    const facts = parseCommandFacts("powershell -NoProfile -ExecutionPolicy Bypass -File test-api.ps1");
    const approved = approveVerifiedWorkspaceScript({
      facts,
      contained: true,
      provenance: "agent-authored",
      profile: BOUNDED_PROFILE,
      hash: "abc",
    });
    assert.strictEqual(approved.kind, "approve");

    const blockedCases = [
      { contained: false, provenance: "agent-authored", profile: BOUNDED_PROFILE },
      { contained: true, provenance: "changed", profile: BOUNDED_PROFILE },
      { contained: true, provenance: "unknown", profile: BOUNDED_PROFILE },
      { contained: true, provenance: "agent-authored", profile: UNBOUNDED_PROFILE },
    ] as const;
    for (const blocked of blockedCases) {
      const verdict = approveVerifiedWorkspaceScript({
        facts,
        contained: blocked.contained,
        provenance: blocked.provenance,
        profile: blocked.profile,
      });
      assert.strictEqual(verdict.kind, "review", JSON.stringify(blocked));
    }

    const escalated = parseCommandFacts("powershell -File test-api.ps1 ; Set-ExecutionPolicy Unrestricted");
    assert.strictEqual(
      approveVerifiedWorkspaceScript({
        facts: escalated,
        contained: true,
        provenance: "agent-authored",
        profile: BOUNDED_PROFILE,
      }).kind,
      "review",
    );
  });
});

suite("positive decision cache", () => {
  const scope = { conversationId: "c1", workspaceId: "ws:1", permissionFingerprint: "fp1" };

  test("requires conversation, workspace, and permission fingerprint to cache", () => {
    assert.strictEqual(isCacheableScope(scope), true);
    assert.strictEqual(isCacheableScope({ workspaceId: "ws:1", permissionFingerprint: "fp1" }), false);
    assert.strictEqual(isCacheableScope({ conversationId: "c1", permissionFingerprint: "fp1" }), false);
    assert.strictEqual(isCacheableScope({ conversationId: "c1", workspaceId: "ws:1" }), false);
  });

  test("changes the key when any justifying fact changes", () => {
    const base = createDecisionKey({ ...scope, toolName: "run_terminal_command", subject: "npm test", contentHash: "h1" });
    assert.strictEqual(
      base,
      createDecisionKey({ ...scope, toolName: "run_terminal_command", subject: "npm test", contentHash: "h1" }),
    );
    assert.notStrictEqual(base, createDecisionKey({ ...scope, toolName: "run_terminal_command", subject: "npm test", contentHash: "h2" }));
    assert.notStrictEqual(base, createDecisionKey({ ...scope, toolName: "run_terminal_command", subject: "npm run test", contentHash: "h1" }));
    assert.notStrictEqual(base, createDecisionKey({ ...scope, conversationId: "c2", toolName: "run_terminal_command", subject: "npm test", contentHash: "h1" }));
    assert.notStrictEqual(base, createDecisionKey({ ...scope, permissionFingerprint: "fp2", toolName: "run_terminal_command", subject: "npm test", contentHash: "h1" }));
  });

  test("evicts the oldest decision beyond its bound", () => {
    const cache = new PositiveDecisionCache(2);
    cache.remember("a");
    cache.remember("b");
    cache.remember("c");
    assert.strictEqual(cache.size, 2);
    assert.strictEqual(cache.has("a"), false);
    assert.strictEqual(cache.has("c"), true);
    cache.clear();
    assert.strictEqual(cache.size, 0);
  });
});
