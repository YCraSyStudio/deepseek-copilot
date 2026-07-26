import * as assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SettingsManager } from "@/vscodeApi/storage/SettingsManager";
import { getSettingsFilePath } from "@/vscodeApi/storage/UserDataPaths";

suite("transactional settings", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousUserDataDir = process.env.DEEPSEEK_COPILOT_USER_DATA_DIR;
  const testRoot = mkdtempSync(path.join(os.tmpdir(), "deepseek-settings-"));

  suiteSetup(async () => {
    process.env.NODE_ENV = "test";
    process.env.DEEPSEEK_COPILOT_USER_DATA_DIR = testRoot;
    await SettingsManager.initialize({ permissionMode: "auto-approve", toolExecutionModes: { read_file: "auto_approve" } });
  });

  suiteTeardown(() => {
    if (previousNodeEnv === undefined) {delete process.env.NODE_ENV;} else {process.env.NODE_ENV = previousNodeEnv;}
    if (previousUserDataDir === undefined) {delete process.env.DEEPSEEK_COPILOT_USER_DATA_DIR;} else {process.env.DEEPSEEK_COPILOT_USER_DATA_DIR = previousUserDataDir;}
    rmSync(testRoot, { recursive: true, force: true });
  });

  test("keeps an authoritative resident copy instead of rereading disk", async () => {
    await SettingsManager.save({ permissionMode: "read-only" });
    const revision = SettingsManager.getRevision();
    const disk = JSON.parse(readFileSync(getSettingsFilePath(), "utf8")) as Record<string, unknown>;
    writeFileSync(getSettingsFilePath(), JSON.stringify({ ...disk, permissionMode: "auto-approve" }));

    assert.strictEqual(SettingsManager.load().permissionMode, "read-only");
    assert.strictEqual(SettingsManager.getRevision(), revision);
  });

  test("rolls back memory and revision when persistence fails", async () => {
    const before = SettingsManager.load();
    const revision = SettingsManager.getRevision();
    rmSync(testRoot, { recursive: true, force: true });
    writeFileSync(testRoot, "blocks directory creation");

    await assert.rejects(SettingsManager.save({ permissionMode: "full-access" }));
    await assert.rejects(SettingsManager.reset());
    assert.deepStrictEqual(SettingsManager.load(), before);
    assert.strictEqual(SettingsManager.getRevision(), revision);
    assert.strictEqual(SettingsManager.isPermissionUpdatePending(), false);

    rmSync(testRoot, { force: true });
  });

  test("fails closed when capturing permissions for an untrusted workspace", async () => {
    await SettingsManager.save({
      permissionMode: "auto-approve",
      toolExecutionModes: { read_file: "auto_approve", run_terminal_command: "auto_approve" },
    });

    const snapshot = await SettingsManager.capturePermissionSnapshot(false);
    assert.strictEqual(snapshot.permissionMode, "read-only");
    assert.strictEqual(snapshot.toolExecutionModes.read_file, "enabled");
    assert.strictEqual(snapshot.toolExecutionModes.run_terminal_command, "enabled");
    assert.strictEqual(snapshot.workspaceTrusted, false);
  });

  test("holds the next permission snapshot behind a delayed durable write", async () => {
    await SettingsManager.save({ permissionMode: "auto-approve" });
    let releaseWrite: (() => void) | undefined;
    const writeGate = new Promise<void>((resolve) => {releaseWrite = resolve;});
    SettingsManager.setPersistenceForTests(() => writeGate);

    const save = SettingsManager.save({ permissionMode: "read-only" });
    const capture = SettingsManager.capturePermissionSnapshot(true);
    let captured = false;
    void capture.then(() => {captured = true;});
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(SettingsManager.isPermissionUpdatePending(), true);
    assert.strictEqual(captured, false);
    assert.strictEqual(SettingsManager.load().permissionMode, "auto-approve");

    releaseWrite?.();
    await save;
    assert.strictEqual((await capture).permissionMode, "read-only");
    SettingsManager.setPersistenceForTests();
  });
});
