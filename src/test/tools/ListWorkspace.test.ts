import * as assert from "assert";
import * as path from "path";
import { listWorkspaceHandler } from "@/infrastructure/tools/builtins/fileSystem/ListWorkspace";
import {
  setToolWorkspaceHost,
  type ToolWorkspaceEntryType,
  type ToolWorkspaceHost,
} from "@/infrastructure/tools/ToolWorkspace";

type DirectoryTree = Record<string, Array<[string, ToolWorkspaceEntryType]>>;

suite("list workspace", () => {
  test("lists hidden entries and summarizes a folder with too much content", async () => {
    createDirectoryHost({
      ".": [["README.md", "file"], [".gitignore", "file"], ["node_modules", "directory"], ["src", "directory"]],
      node_modules: Array.from({ length: 30 }, (_, index) => [`pkg-${index}`, "directory"] as [string, ToolWorkspaceEntryType]),
      src: [["index.ts", "file"], ["utils", "directory"]],
      "src/utils": [["format.ts", "file"]],
    });

    const output = await listWorkspaceHandler({});

    assert.strictEqual(output.split("\n")[0], "Workspace tree for \".\" (4 files, 3 folders). Hidden entries are included; a folder shown as \"...\" holds more entries than this summary lists:");
    assert.ok(output.includes("node_modules/\n  ...\n"), output);
    assert.ok(output.includes(".gitignore\n"), output);
    assert.ok(output.includes("src/\n  utils/\n    format.ts\n  index.ts\n"), output);
    assert.ok(!output.includes("pkg-0"), "node_modules children must not be listed");
    assert.ok(output.includes("1 folder is summarized as \"...\""), output);
  });

  test("scopes the tree to one subfolder", async () => {
    createDirectoryHost({
      ".": [["src", "directory"]],
      src: [["app.ts", "file"]],
    });

    const output = await listWorkspaceHandler({ path: "./src/" });

    assert.strictEqual(output.split("\n")[0], "Workspace tree for \"src\" (1 files, 0 folders). Hidden entries are included; a folder shown as \"...\" holds more entries than this summary lists:");
    assert.ok(output.includes("\napp.ts"), output);
  });

  test("rejects paths that can escape the workspace", async () => {
    createDirectoryHost({ ".": [] });

    await assert.rejects(() => listWorkspaceHandler({ path: "../secrets" }), /stay inside the workspace/);
    await assert.rejects(() => listWorkspaceHandler({ path: "/etc" }), /relative to the selected workspace/);
    await assert.rejects(() => listWorkspaceHandler({ path: 42 }), /path must be a string/);
  });

  test("propagates cancellation as AbortError", async () => {
    createDirectoryHost({ ".": [["app.ts", "file"]] });
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      () => listWorkspaceHandler({}, { signal: controller.signal }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
  });

  test("reports an unreadable scope instead of an empty tree", async () => {
    createDirectoryHost({ ".": [["src", "directory"]] });

    await assert.rejects(() => listWorkspaceHandler({ path: "missing" }), /Cannot list workspace path "missing"/);
  });
});

function createDirectoryHost(directories: DirectoryTree): void {
  const host: ToolWorkspaceHost = {
    getRootPath: () => path.resolve("C:/workspace"),
    readFile: async () => Buffer.from(""),
    writeFile: async () => undefined,
    stat: async () => ({ type: "unknown", size: 0 }),
    createParentDirectory: async () => undefined,
    readDirectory: async (dirPath: string) => {
      const entries = directories[dirPath];
      if (!entries) {
        throw new Error(`Missing test directory: ${dirPath}`);
      }
      return entries;
    },
  };
  setToolWorkspaceHost(host);
}
