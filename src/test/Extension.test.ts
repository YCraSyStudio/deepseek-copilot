import * as assert from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { searchContentHandler } from "../core/tools/definitions/SearchContent";
import { setToolWorkspaceHost } from "../core/tools/ToolWorkspace";
import { createVsCodeToolWorkspace } from "../vscodeApi/tools/VsCodeToolWorkspace";

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
      messages?: Array<{ role?: string; generationId?: string; generationStatus?: string }>;
    };
    assert.strictEqual(migrated.schemaVersion, 2);
    assert.ok(migrated.messages?.[0].generationId);
    assert.strictEqual(migrated.messages?.[1].generationId, migrated.messages?.[0].generationId);
    assert.strictEqual(migrated.messages?.[1].generationStatus, "completed");
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("yrs-dpsk-copilot.openChat"));
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
      host.setRootPath?.(workspaceFolder.uri.fsPath);
      setToolWorkspaceHost(host);

      const result = await searchContentHandler({
        query: "[literal] & value",
        filePattern: `${directoryName}/*`,
      });
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
