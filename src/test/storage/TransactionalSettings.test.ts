import * as assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SettingsManager } from "@/vscodeApi/storage/SettingsManager";
import { getSettingsFilePath } from "@/vscodeApi/storage/UserDataPaths";
import { getGenerationCheckpointDirectory } from "@/vscodeApi/storage/UserDataPaths";
import { GenerationCheckpointStore } from "@/vscodeApi/storage/GenerationCheckpointStore";

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
    await SettingsManager.save({ permissionMode: "default" });
    const revision = SettingsManager.getRevision();
    const disk = JSON.parse(readFileSync(getSettingsFilePath(), "utf8")) as Record<string, unknown>;
    writeFileSync(getSettingsFilePath(), JSON.stringify({ ...disk, permissionMode: "auto-approve" }));

    assert.strictEqual(SettingsManager.load().permissionMode, "default");
    assert.strictEqual(SettingsManager.getRevision(), revision);
  });

  test("persists normalized web search settings with safe defaults", async () => {
    assert.strictEqual(SettingsManager.load().webSearchEngine, "bing");
    await SettingsManager.save({ webSearchEngine: "google" });
    assert.strictEqual(SettingsManager.load().webSearchEngine, "google");
    const disk = JSON.parse(readFileSync(getSettingsFilePath(), "utf8")) as Record<string, unknown>;
    assert.strictEqual(Object.prototype.hasOwnProperty.call(disk, "webSearchBrowserVisible"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(disk, "usageBudgets"), false);
    await SettingsManager.save({ webSearchEngine: "bing" });
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
    assert.strictEqual(snapshot.permissionMode, "default");
    assert.strictEqual(snapshot.toolExecutionModes.read_file, "enabled");
    assert.strictEqual(snapshot.toolExecutionModes.run_terminal_command, "enabled");
    assert.strictEqual(snapshot.workspaceTrusted, false);
  });

  test("holds the next permission snapshot behind a delayed durable write", async () => {
    await SettingsManager.save({ permissionMode: "auto-approve" });
    let releaseWrite: (() => void) | undefined;
    const writeGate = new Promise<void>((resolve) => {releaseWrite = resolve;});
    SettingsManager.setPersistenceForTests(() => writeGate);

    const save = SettingsManager.save({ permissionMode: "default" });
    const capture = SettingsManager.capturePermissionSnapshot(true);
    let captured = false;
    void capture.then(() => {captured = true;});
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.strictEqual(SettingsManager.isPermissionUpdatePending(), true);
    assert.strictEqual(captured, false);
    assert.strictEqual(SettingsManager.load().permissionMode, "auto-approve");

    releaseWrite?.();
    await save;
    assert.strictEqual((await capture).permissionMode, "default");
    SettingsManager.setPersistenceForTests();
  });

  test("does not write checkpoints while history is disabled and clears stale files", async () => {
    const store = new GenerationCheckpointStore();
    const checkpoint = {
      conversationId: "incognito-conversation",
      status: "streaming" as const,
      content: "private partial response",
      timeline: [],
      toolCalls: [],
      queue: [],
      workspaceUri: "file:///workspace",
      updatedAt: Date.now(),
    };

    await SettingsManager.save({ historyEnabled: false });
    await store.save(checkpoint);
    const directory = getGenerationCheckpointDirectory();
    assert.strictEqual(existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")).length : 0, 0);

    await SettingsManager.save({ historyEnabled: true });
    await store.save(checkpoint);
    assert.strictEqual(readdirSync(directory).filter((name) => name.endsWith(".json")).length, 1);

    await SettingsManager.save({ historyEnabled: false });
    await store.clearAll();
    assert.strictEqual(readdirSync(directory).filter((name) => name.endsWith(".json")).length, 0);
  });
});
