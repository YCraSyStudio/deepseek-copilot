import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { searchContentHandler } from "@/core/tools/definitions/SearchContent";
import { runWithToolWorkspaceHost } from "@/core/tools/ToolWorkspace";
import { createVsCodeToolWorkspace } from "@/vscodeApi/tools/VsCodeToolWorkspace";
import { captureCurrentWorkspaceBinding, type WorkspaceRunSnapshot } from "@/vscodeApi/workspace";
import { getPathCompletionItems } from "@/vscodeApi/editor/EditorActions";
import { HistoryManager } from "@/vscodeApi/storage/HistoryManager";

suite("Extension integration", () => {
  test("activates under the Marketplace identifier and registers its main command", async () => {
    const extension = vscode.extensions.getExtension("yarcrasy.yrs-dpsk-copilot");

    assert.ok(extension, "The development extension should be discoverable by its Marketplace identifier.");
    const testDataDirectory = process.env.DEEPSEEK_COPILOT_USER_DATA_DIR;
    assert.ok(testDataDirectory);
    const historyDirectory = path.join(testDataDirectory, "history");
    const unversionedPath = path.join(historyDirectory, "unversioned-integration.json");

    await extension.activate();

    assert.strictEqual(extension.isActive, true);
    const manager = new HistoryManager(extension.exports?.context ?? createHistoryTestContext());
    await manager.initialize();
    await manager.getSummaries();
    const migrated = JSON.parse(await readFile(unversionedPath, "utf8")) as {
      schemaVersion?: number;
      workspaceBinding?: { revision?: string };
      messages?: Array<{ generationId?: string }>;
    };
    assert.strictEqual(migrated.schemaVersion, 2);
    assert.ok(migrated.workspaceBinding?.revision);
    assert.match(migrated.messages?.[0]?.generationId ?? "", /^legacy-/);
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("yrs-dpsk-copilot.openChat"));
    assert.ok(commands.includes("yrs-dpsk-copilot.installChromiumHeadless"));
    assert.ok(commands.includes("yrs-dpsk-copilot.updateChromiumHeadless"));
    assert.ok(commands.includes("yrs-dpsk-copilot.removeChromiumHeadless"));
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

  test("exposes external paths only through an explicitly permissive generation host", async () => {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    assert.ok(workspaceRoot);
    const externalPath = path.dirname(workspaceRoot);
    const restrictedHost = createVsCodeToolWorkspace();
    const permissiveHost = createVsCodeToolWorkspace(undefined, { allowOutsideWorkspace: true });

    await assert.rejects(restrictedHost.resolvePath!(externalPath, false), /relative to the selected workspace/);
    assert.strictEqual(await permissiveHost.resolvePath!(externalPath, false), path.resolve(externalPath));
    assert.strictEqual(await permissiveHost.isPathInsideWorkspace!(externalPath), false);
  });

  test("reads only bounded head and tail excerpts for large local files", async () => {
    const host = createVsCodeToolWorkspace();
    const preview = await host.readFilePreview!("package-lock.json", 1_024);

    assert.ok(preview.size > 1_024);
    assert.strictEqual(preview.head.byteLength, 512);
    assert.strictEqual(preview.tail?.byteLength, 512);
    assert.match(Buffer.from(preview.head).toString("utf8"), /^\{/);
    assert.match(Buffer.from(preview.tail!).toString("utf8"), /}\s*$/);
  });

  test("reads and edits the authoritative open buffer with undo support", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const fileName = `open-buffer-${randomUUID()}.txt`;
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
    await vscode.workspace.fs.writeFile(uri, Buffer.from("saved\n"));

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      const userEdit = new vscode.WorkspaceEdit();
      userEdit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), "unsaved user text\n");
      assert.strictEqual(await vscode.workspace.applyEdit(userEdit), true);
      assert.strictEqual(document.isDirty, true);

      const host = createVsCodeToolWorkspace();
      assert.strictEqual(Buffer.from(await host.readFile(fileName)).toString("utf8"), "unsaved user text\n");
      await host.writeFile(fileName, Buffer.from("unsaved user text plus tool change\n"));
      assert.strictEqual(document.getText(), "unsaved user text plus tool change\n");
      assert.strictEqual(document.isDirty, true);

      await vscode.commands.executeCommand("undo");
      assert.strictEqual(document.getText(), "unsaved user text\n");
    } finally {
      await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      await vscode.workspace.fs.delete(uri, { useTrash: false });
    }
  });

  test("rejects a stale conversation save from another manager instance", async () => {
    const extension = vscode.extensions.getExtension("yarcrasy.yrs-dpsk-copilot");
    assert.ok(extension);
    const first = new HistoryManager(extension.exports?.context ?? createHistoryTestContext());
    const second = new HistoryManager(extension.exports?.context ?? createHistoryTestContext());
    await Promise.all([first.initialize(), second.initialize()]);
    const binding = captureCurrentWorkspaceBinding();
    const id = `concurrent-${randomUUID()}`;
    const now = Date.now();
    const base = {
      schemaVersion: 2 as const,
      id,
      title: "Concurrent test",
      createdAt: now,
      model: "deepseek-v4-flash",
      workspaceUri: binding.uri,
      workspaceBinding: binding,
      messages: [],
    };
    try {
      await first.save({ ...base, updatedAt: now + 2 });
      await assert.rejects(second.save({ ...base, updatedAt: now + 1 }), /changed in another VS Code window/);
    } finally {
      await first.delete(id);
    }
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

function createHistoryTestContext(): vscode.ExtensionContext {
  return { workspaceState: { keys: () => [], get: () => undefined, update: async () => undefined } } as unknown as vscode.ExtensionContext;
}
