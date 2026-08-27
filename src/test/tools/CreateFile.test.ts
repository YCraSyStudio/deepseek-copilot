import * as assert from "node:assert";
import { setToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import { createFileHandlerForced } from "@/infrastructure/tools/builtins/fileSystem/CreateFile";

suite("create_file missing-file guard", () => {
  test("does not overwrite a file that appeared after web-tainted approval", async () => {
    let writes = 0;
    setToolWorkspaceHost({
      getRootPath: () => process.cwd(),
      readFile: async () => Buffer.from("appeared"),
      writeFile: async () => {writes += 1;},
      stat: async () => ({ type: "file", size: 8 }),
      createParentDirectory: async () => undefined,
      readDirectory: async () => [],
    });
    const result = await createFileHandlerForced({ path: "new.txt", content: "replacement", expectedBeforeHash: "missing" });
    assert.match(result, /file appeared after approval/i);
    assert.strictEqual(writes, 0);
  });
});
