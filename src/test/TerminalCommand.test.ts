import * as assert from "node:assert";
import { terminalCommandHandler } from "@/core/tools/definitions/TerminalCommand";
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
    assert.strictEqual(typeof confirmation.shell, "string");
    assert.strictEqual(typeof confirmation.reasonCode, "string");
  });
});
