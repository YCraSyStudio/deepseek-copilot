import * as assert from "node:assert";
import { SYSTEM_PROMPT_COPILOT } from "@/adapters/deepseek/Chat";
import { REVIEW_SYSTEM_PROMPT } from "@/deepseekApi/security/CommandSafetyReviewer";

suite("system tool guidance", () => {
  test("keeps the coding prompt compact and principle-based", () => {
    assert.ok(SYSTEM_PROMPT_COPILOT.length < 1_800);
    assert.match(SYSTEM_PROMPT_COPILOT, /runtime workspace and tool list as authoritative/);
    assert.match(SYSTEM_PROMPT_COPILOT, /narrowest file\/search tool over terminal/);
    assert.match(SYSTEM_PROMPT_COPILOT, /finite and non-interactive/);
    assert.match(SYSTEM_PROMPT_COPILOT, /Follow security-review results/);
    assert.doesNotMatch(SYSTEM_PROMPT_COPILOT, /\b(?:Astro|frontend|backend|npm|template)\b|2>&1/i);
  });

  test("keeps the reviewer prompt compact and delegates concrete evidence to its payload", () => {
    assert.ok(REVIEW_SYSTEM_PROMPT.length < 1_300);
    assert.match(REVIEW_SYSTEM_PROMPT, /File excerpts are bounded read-only snapshots/);
    assert.match(REVIEW_SYSTEM_PROMPT, /medium_high confidence or above/);
    assert.doesNotMatch(REVIEW_SYSTEM_PROMPT, /\b(?:Astro|scaffolder|npm|dotnet|template)\b|2>&1/i);
  });
});
