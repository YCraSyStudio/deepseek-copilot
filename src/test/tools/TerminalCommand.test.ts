import * as assert from "node:assert";
import * as path from "node:path";
import {
  normalizeLeadingDirectoryChange,
  terminalCommandHandler,
} from "@/core/tools/definitions/TerminalCommand";
import { setToolWorkspaceHost } from "@/core/tools/ToolWorkspace";

suite("terminal command confirmation", () => {
  test("includes the exact command and resolved execution environment", async () => {
    setToolWorkspaceHost({
      getRootPath: () => process.cwd(),
      realPath: async (value) => value,
      readFile: async () => new Uint8Array(),
      writeFile: async () => undefined,
      stat: async () => ({ type: "file", size: 0 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    const command = "echo unsafe >> output.txt";

    const raw = await terminalCommandHandler({ command });
    const confirmation = JSON.parse(raw) as Record<string, unknown>;

    assert.strictEqual(confirmation.requiresConfirmation, true);
    assert.strictEqual(confirmation.command, command);
    assert.strictEqual(typeof confirmation.cwd, "string");
    assert.strictEqual(confirmation.workspaceRoot, process.cwd());
    assert.strictEqual(typeof confirmation.shell, "string");
    assert.strictEqual(typeof confirmation.reasonCode, "string");
  });

  test("moves a leading cd into the structured cwd argument", () => {
    assert.deepStrictEqual(
      normalizeLeadingDirectoryChange("cd frontend && npm install"),
      { command: "npm install", cwd: "frontend" },
    );
    assert.deepStrictEqual(
      normalizeLeadingDirectoryChange('cd /d "apps/frontend" && npm run build', "project"),
      { command: "npm run build", cwd: path.join("project", "apps/frontend") },
    );
  });

  test("does not rewrite compound commands that do not begin with directory navigation", () => {
    const command = "mkdir project && cd project && npm install";
    assert.deepStrictEqual(normalizeLeadingDirectoryChange(command), { command, cwd: undefined });
  });
});
