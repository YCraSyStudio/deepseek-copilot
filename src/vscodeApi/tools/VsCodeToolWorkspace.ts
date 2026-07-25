import * as path from "path";
import { realpath } from "fs/promises";
import * as vscode from "vscode";
import type { ToolWorkspaceEntryType, ToolWorkspaceFindOptions, ToolWorkspaceHost, ToolWorkspaceStat } from "@/core/tools/ToolWorkspace";

export function createVsCodeToolWorkspace(): ToolWorkspaceHost {
  const inlinePreview = createInlineDiffPreview();
  let selectedRootPath: string | undefined;
  const getRootUri = (): vscode.Uri | undefined => {
    const requestedRootPath = selectedRootPath;
    const selected = requestedRootPath
      ? vscode.workspace.workspaceFolders?.find((folder) => path.resolve(folder.uri.fsPath) === path.resolve(requestedRootPath))?.uri
      : undefined;
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    return selected ?? (activeUri ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri : undefined) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  };

  return {
    getRootPath(): string | undefined {
      return getRootUri()?.fsPath;
    },

    setRootPath(rootPath: string | undefined): void {
      selectedRootPath = rootPath;
    },

    realPath(absolutePath: string): Promise<string> {
      return realpath(absolutePath);
    },

    async findFiles(options: ToolWorkspaceFindOptions): Promise<string[]> {
      const rootUri = getRootUri();
      if (!rootUri) {
        throw new Error("No workspace folder open");
      }
      if (options.signal?.aborted) {
        throw createAbortError();
      }

      const cancellation = new vscode.CancellationTokenSource();
      const onAbort = () => cancellation.cancel();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const include = new vscode.RelativePattern(rootUri, options.includePattern);
        const resources = await vscode.workspace.findFiles(include, undefined, options.maxResults, cancellation.token);
        if (options.signal?.aborted) {
          throw createAbortError();
        }
        return resources.map((resource) => toRelativeWorkspacePath(rootUri, resource));
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
        cancellation.dispose();
      }
    },

    async readFile(relativePath: string): Promise<Uint8Array> {
      return vscode.workspace.fs.readFile(toWorkspaceUri(getRootUri(), relativePath));
    },

    async writeFile(relativePath: string, content: Uint8Array): Promise<void> {
      await vscode.workspace.fs.writeFile(toWorkspaceUri(getRootUri(), relativePath), content);
      inlinePreview.clear();
    },

    async stat(relativePath: string): Promise<ToolWorkspaceStat> {
      const stat = await vscode.workspace.fs.stat(toWorkspaceUri(getRootUri(), relativePath));
      return {
        type: toEntryType(stat.type),
        size: stat.size,
      };
    },

    async createParentDirectory(relativePath: string): Promise<void> {
      const parentPath = path.posix.dirname(relativePath.replace(/\\/g, "/"));
      if (!parentPath || parentPath === ".") {
        return;
      }
      await vscode.workspace.fs.createDirectory(toWorkspaceUri(getRootUri(), parentPath));
    },

    async readDirectory(relativePath: string): Promise<Array<[string, ToolWorkspaceEntryType]>> {
      const entries = await vscode.workspace.fs.readDirectory(toWorkspaceUri(getRootUri(), relativePath));
      return entries.map(([name, type]) => [name, toEntryType(type)]);
    },

    async prepareFileDiff(relativePath: string, before: string, after: string): Promise<void> {
      const originalUri = toWorkspaceUri(getRootUri(), relativePath);
      await inlinePreview.show(originalUri, before, after);
    },

    clearFileDiffPreview(): void {
      inlinePreview.clear();
    },
  };
}

function toWorkspaceUri(root: vscode.Uri | undefined, relativePath: string): vscode.Uri {
  if (!root) {
    throw new Error("No workspace folder open");
  }
  return vscode.Uri.joinPath(root, relativePath);
}

function toRelativeWorkspacePath(root: vscode.Uri, resource: vscode.Uri): string {
  if (root.scheme !== resource.scheme || root.authority !== resource.authority) {
    throw new Error("Workspace search returned a resource outside the selected workspace");
  }
  const relativePath = root.scheme === "file"
    ? path.relative(root.fsPath, resource.fsPath)
    : path.posix.relative(root.path, resource.path);
  if (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new Error("Workspace search returned a resource outside the selected workspace");
  }
  return relativePath.replace(/\\/g, "/");
}

function createAbortError(): Error {
  const error = new Error("Workspace search cancelled");
  error.name = "AbortError";
  return error;
}

function toEntryType(type: vscode.FileType): ToolWorkspaceEntryType {
  if (type === vscode.FileType.Directory) {
    return "directory";
  }
  if (type === vscode.FileType.File) {
    return "file";
  }
  return "unknown";
}

function createInlineDiffPreview(): {
  show(uri: vscode.Uri, before: string, after: string): Promise<void>;
  clear(): void;
} {
  let activeEditor: vscode.TextEditor | undefined;
  let removalDecoration: vscode.TextEditorDecorationType | undefined;
  let additionDecoration: vscode.TextEditorDecorationType | undefined;

  function clear(): void {
    if (activeEditor && removalDecoration) {
      activeEditor.setDecorations(removalDecoration, []);
    }
    if (activeEditor && additionDecoration) {
      activeEditor.setDecorations(additionDecoration, []);
    }
    removalDecoration?.dispose();
    additionDecoration?.dispose();
    activeEditor = undefined;
    removalDecoration = undefined;
    additionDecoration = undefined;
  }

  async function show(uri: vscode.Uri, before: string, after: string): Promise<void> {
    clear();

    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    const preview = computeInlinePreview(before, after, document);
    if (!preview) {
      return;
    }

    removalDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(244, 71, 71, 0.16)",
      overviewRulerColor: "rgba(244, 71, 71, 0.75)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    additionDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: preview.additionLabel,
        color: "rgba(137, 209, 133, 0.95)",
        margin: "0 0 0 1rem",
        fontStyle: "italic",
      },
      overviewRulerColor: "rgba(137, 209, 133, 0.75)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    if (preview.removalRange) {
      editor.setDecorations(removalDecoration, [preview.removalRange]);
    }
    if (preview.additionRange && preview.additionLabel) {
      editor.setDecorations(additionDecoration, [preview.additionRange]);
    }
    activeEditor = editor;
  }

  return { show, clear };
}

function computeInlinePreview(
  before: string,
  after: string,
  document: vscode.TextDocument,
): { removalRange?: vscode.Range; additionRange?: vscode.Range; additionLabel: string } | null {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  let start = 0;

  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start += 1;
  }

  if (start === beforeLines.length && start === afterLines.length) {
    return null;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= start && afterEnd >= start && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removalRange = createRemovalRange(document, start, beforeEnd);
  const additionLines = afterLines.slice(start, afterEnd + 1);
  const additionRange = createAdditionAnchor(document, start);

  return {
    removalRange,
    additionRange,
    additionLabel: formatAdditionLabel(additionLines),
  };
}

function createRemovalRange(document: vscode.TextDocument, start: number, end: number): vscode.Range | undefined {
  if (end < start || document.lineCount === 0) {
    return undefined;
  }
  const firstLine = clampLine(start, document);
  const lastLine = clampLine(end, document);
  return new vscode.Range(firstLine, 0, lastLine, document.lineAt(lastLine).range.end.character);
}

function createAdditionAnchor(document: vscode.TextDocument, start: number): vscode.Range | undefined {
  if (document.lineCount === 0) {
    return undefined;
  }
  const anchorLine = clampLine(Math.max(start - 1, 0), document);
  const anchorCharacter = document.lineAt(anchorLine).range.end.character;
  return new vscode.Range(anchorLine, anchorCharacter, anchorLine, anchorCharacter);
}

function clampLine(line: number, document: vscode.TextDocument): number {
  return Math.max(0, Math.min(line, document.lineCount - 1));
}

function formatAdditionLabel(lines: string[]): string {
  const meaningfulLines = lines.filter((line) => line.trim().length > 0);
  if (meaningfulLines.length === 0) {
    return "";
  }
  const firstLine = meaningfulLines[0]!.trim();
  const suffix = meaningfulLines.length > 1 ? ` … (+${meaningfulLines.length - 1} lines)` : "";
  return `  + ${truncatePreview(firstLine, 96)}${suffix}`;
}

function truncatePreview(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, "\n").split("\n");
}
