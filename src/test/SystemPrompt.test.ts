import * as assert from "node:assert";
import { SYSTEM_PROMPT_COPILOT } from "@/adapters/deepseek/Chat";

suite("system tool guidance", () => {
  test("prevents the command misuse observed in production history", () => {
    assert.match(SYSTEM_PROMPT_COPILOT, /Never use terminal commands[\s\S]*to read, create, overwrite, move, or delete project files/);
    assert.match(SYSTEM_PROMPT_COPILOT, /cwd argument instead of using cd/);
    assert.match(SYSTEM_PROMPT_COPILOT, /Never detach, background, or leave a server\/watch process running/);
    assert.match(SYSTEM_PROMPT_COPILOT, /Preserve truthful exit status/);
    assert.match(SYSTEM_PROMPT_COPILOT, /declared package scripts/);
  });
});
