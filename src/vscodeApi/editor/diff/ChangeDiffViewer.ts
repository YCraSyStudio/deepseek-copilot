import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { WorkspaceBinding } from "@/adapters";
import { logError } from "@/shared/logging/Logger";
import { validateWorkspaceFilePath } from "../EditorActions";
import { reconstructDiffDocuments } from "./UnifiedDiffDocuments";

const CHANGE_SCHEME = "yrs-change";
const MAX_RETAINED_DOCUMENTS = 24;

export class ChangeDiffViewer implements vscode.Disposable {
  private readonly documents = new Map<string, string>();
  private readonly disposables: vscode.Disposable[];

  constructor() {
    const provider: vscode.TextDocumentContentProvider = {
      provideTextDocumentContent: (uri) => this.documents.get(uri.toString()) ?? "",
    };
    this.disposables = [
      vscode.workspace.registerTextDocumentContentProvider(CHANGE_SCHEME, provider),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme === CHANGE_SCHEME) {
          this.documents.delete(document.uri.toString());
        }
      }),
    ];
  }

  public async open(filePath: string, diff: string, binding: WorkspaceBinding): Promise<void> {
    try {
      await validateWorkspaceFilePath(filePath, binding);
      const documents = reconstructDiffDocuments(diff);
      if (!documents) {
        throw new Error("The saved change is incomplete and cannot be compared.");
      }

      const id = randomUUID();
      const filename = sanitizeFilename(path.posix.basename(filePath.replace(/\\/g, "/")));
      const beforeUri = vscode.Uri.from({ scheme: CHANGE_SCHEME, path: `/${id}/before/${filename}` });
      const afterUri = vscode.Uri.from({ scheme: CHANGE_SCHEME, path: `/${id}/after/${filename}` });
      this.retain(beforeUri, documents.before);
      this.retain(afterUri, documents.after);

      await vscode.commands.executeCommand(
        "vscode.diff",
        beforeUri,
        afterUri,
        `${filename} — tool change`,
        { preview: true },
      );
    } catch (err) {
      logError(`[ChangeDiffViewer] Error opening change for '${filePath}'`, err);
      await vscode.window.showErrorMessage(err instanceof Error ? err.message : "Unable to open the saved change.");
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.documents.clear();
  }

  private retain(uri: vscode.Uri, content: string): void {
    this.documents.set(uri.toString(), content);
    while (this.documents.size > MAX_RETAINED_DOCUMENTS) {
      const oldest = this.documents.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }
      this.documents.delete(oldest);
    }
  }
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(/[/?#\u0000-\u001f]/g, "_");
  return sanitized || "change.txt";
}
