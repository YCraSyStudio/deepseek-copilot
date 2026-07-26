import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { searchContentHandler } from "../core/tools/definitions/SearchContent";
import { runWithToolWorkspaceHost } from "../core/tools/ToolWorkspace";
import { createVsCodeToolWorkspace } from "../vscodeApi/tools/VsCodeToolWorkspace";
import { captureCurrentWorkspaceBinding, type WorkspaceRunSnapshot } from "../vscodeApi/workspace";
import { getPathCompletionItems } from "../vscodeApi/editor/EditorActions";

suite("Extension integration", () => {
  test("activates under the Marketplace identifier and registers its main command", async () => {
    const extension = vscode.extensions.getExtension("yarcrasy.yrs-dpsk-copilot");

    assert.ok(extension, "The development extension should be discoverable by its Marketplace identifier.");
    const testDataDirectory = process.env.DEEPSEEK_COPILOT_USER_DATA_DIR;
    assert.ok(testDataDirectory);
    const historyDirectory = path.join(testDataDirectory, "history");
    const legacyPath = path.join(historyDirectory, "legacy-integration.json");

    await extension.activate();

    assert.strictEqual(extension.isActive, true);
    const migrated = JSON.parse(await readFile(legacyPath, "utf8")) as {
      schemaVersion?: number;
      workspaceBinding?: { revision?: string; folders?: Array<{ alias?: string; uri?: string }> };
      messages?: Array<{ role?: string; generationId?: string; generationStatus?: string }>;
    };
    assert.strictEqual(migrated.schemaVersion, 2);
    assert.ok(migrated.workspaceBinding?.revision);
    assert.strictEqual(migrated.workspaceBinding?.folders?.length, 1);
    assert.ok(migrated.messages?.[0].generationId);
    assert.strictEqual(migrated.messages?.[1].generationId, migrated.messages?.[0].generationId);
    assert.strictEqual(migrated.messages?.[1].generationStatus, "completed");
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("yrs-dpsk-copilot.openChat"));
  });

  test("captures a revisioned workspace binding and rejects parent autocomplete", async () => {
    const binding = captureCurrentWorkspaceBinding();
    assert.strictEqual(binding.folders.length, 1);
    assert.ok(binding.folders[0]?.alias);
    assert.ok(binding.revision);
    assert.deepStrictEqual(await getPathCompletionItems("../", binding), []);
    const resolvedTerminalRoot = await createVsCodeToolWorkspace().resolveLocalPath!();
    assert.strictEqual(resolvedTerminalRoot.workspaceRoot, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  });

  test("keeps the multi-root virtual root listable but rejects it as a terminal cwd", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const folders = ["frontend", "backend"].map((alias) => ({
      uri: workspaceFolder.uri.toString(),
      name: alias,
      alias,
      scheme: workspaceFolder.uri.scheme,
      rootUri: workspaceFolder.uri,
      localPath: workspaceFolder.uri.fsPath,
    }));
    const snapshot: WorkspaceRunSnapshot = {
      binding: {
        schemaVersion: 1,
        uri: "yrs-workspace:test-multi-root",
        name: "Test multi-root",
        revision: "test-revision",
        folders,
        capabilities: { files: true, search: true, git: true, terminal: true },
      },
      folders,
      defaultFolderAlias: "frontend",
    };
    const host = createVsCodeToolWorkspace(snapshot);

    assert.strictEqual(await host.resolvePath!(".", false), ".");
    await assert.rejects(host.resolveLocalPath!("."), /must start with one of/);
    assert.strictEqual((await host.resolveLocalPath!()).workspaceRoot, workspaceFolder.uri.fsPath);
  });

  test("searches literal workspace content through the VS Code filesystem without exposing sensitive files", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, "The integration test must run with the repository open as a workspace.");

    const directoryName = `search-content-${randomUUID()}`;
    const testDirectoryUri = vscode.Uri.joinPath(workspaceFolder.uri, directoryName);
    await vscode.workspace.fs.createDirectory(testDirectoryUri);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(testDirectoryUri, "safe file.txt"),
      Buffer.from("marker [literal] & value\n"),
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(testDirectoryUri, "credentials.json"),
      Buffer.from("marker [literal] & value\n"),
    );

    try {
      const host = createVsCodeToolWorkspace();
      const result = await runWithToolWorkspaceHost(host, () => searchContentHandler({
        query: "[literal] & value",
        filePattern: `${directoryName}/*`,
      }));
      const payload = JSON.parse(result) as {
        type?: string;
        results?: Array<{ file: string; line: number; text: string }>;
      };

      assert.strictEqual(payload.type, "SearchResults");
      assert.deepStrictEqual(payload.results, [{
        file: `${directoryName}/safe file.txt`,
        line: 1,
        text: "marker [literal] & value",
      }]);
    } finally {
      await vscode.workspace.fs.delete(testDirectoryUri, { recursive: true, useTrash: false });
    }
  });
});
