import * as assert from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { writeJsonFileAtomic } from "@/vscodeApi/storage/JsonFileStorage";

suite("JSON file storage", () => {
  test("creates parent directories and replaces an existing JSON file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "yrs-dpsk-copilot-"));
    const target = path.join(root, "nested", "settings.json");

    try {
      await writeJsonFileAtomic(target, { version: 1 });
      await writeJsonFileAtomic(target, { version: 2, enabled: true });

      const stored = JSON.parse(await readFile(target, "utf8")) as unknown;
      assert.deepStrictEqual(stored, { version: 2, enabled: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
