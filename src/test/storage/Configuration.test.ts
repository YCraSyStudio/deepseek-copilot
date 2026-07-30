import * as assert from "assert";
import * as os from "node:os";
import * as path from "node:path";
import { getHistoryDirectory, getSettingsFilePath, getUserDataDirectory } from "@/vscodeApi/storage/UserDataPaths";

suite("user data paths", () => {
  test("stores settings and history below the user profile", () => {
    const root = path.join(os.homedir(), ".yrs-dpsk-copilot");
    assert.strictEqual(getUserDataDirectory(), root);
    assert.strictEqual(getSettingsFilePath(), path.join(root, "settings.json"));
    assert.strictEqual(getHistoryDirectory(), path.join(root, "history"));
  });
});
