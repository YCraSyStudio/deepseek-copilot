import * as path from "path";
import { realpath } from "fs/promises";
import * as vscode from "vscode";
import type { ToolWorkspaceEntryType, ToolWorkspaceFindOptions, ToolWorkspaceHost, ToolWorkspaceStat } from "@/core/tools/ToolWorkspace";
import { isSensitiveWorkspacePath, resolveWorkspacePathSecure } from "@/core/tools/ToolWorkspace";
import {
  captureCurrentWorkspaceBinding,
  captureWorkspaceRunSnapshot,
  type WorkspaceFolderSnapshot,
  type WorkspaceRunSnapshot,
} from "@/vscodeApi/workspace";

export function createVsCodeToolWorkspace(
  capturedSnapshot?: WorkspaceRunSnapshot,
): ToolWorkspaceHost {
  const inlinePreview = createInlineDiffPreview();
  const snapshot = capturedSnapshot ?? captureWorkspaceRunSnapshot(captureCurrentWorkspaceBinding());
  const defaultFolder = snapshot.folders.find((folder) => folder.alias === snapshot.defaultFolderAlias);

  return {
    getRootPath(): string | undefined {
      return defaultFolder?.localPath ?? (snapshot.folders.length === 1 ? snapshot.folders[0]?.localPath : undefined);
    },

    getWorkspaceId(): string {
      return snapshot.binding.uri;
    },

    getAvailableRootAliases(): string[] {
      return snapshot.folders.map((folder) => folder.alias);
    },

    getDefaultRootAlias(): string | undefined {
      return defaultFolder?.alias;
    },

    async resolvePath(rawPath: string, allowSensitive: boolean): Promise<string> {
      if (isVirtualWorkspaceRoot(snapshot, rawPath)) {
        return ".";
      }
      const resolved = resolveLogicalPath(snapshot, rawPath);
      await validateResolvedPath(resolved, allowSensitive);
      return resolved.logicalPath;
    },

    async resolveLocalPath(rawPath?: string) {
      const resolved = rawPath
        ? resolveLogicalPath(snapshot, rawPath)
        : resolveDefaultLocalFolder(snapshot);
      if (!resolved.folder.localPath) {
        throw new Error(`Terminal is unavailable for workspace root "${resolved.folder.alias}".`);
      }
      const localPath = await resolveWorkspacePathSecure(resolved.relativePath, resolved.folder.localPath, realpath, { allowSensitive: true });
      return { ...localPath, workspaceRoot: resolved.folder.localPath };
    },

    realPath(absolutePath: string): Promise<string> {
      return realpath(absolutePath);
    },

    async findFiles(options: ToolWorkspaceFindOptions): Promise<string[]> {
      if (options.signal?.aborted) {
        throw createAbortError();
      }
      const searches = resolveSearchPatterns(snapshot, options.includePattern);
      const results: string[] = [];
      for (const search of searches) {
        const remaining = Math.max(0, options.maxResults - results.length);
        if (remaining === 0) {break;}
        const resources = await findFilesInRoot(search.folder.rootUri, search.pattern, remaining, options.signal);
        results.push(...resources.map((resource) => formatLogicalPath(snapshot, search.folder, toRelativeWorkspacePath(search.folder.rootUri, resource))));
      }
      return results;
    },

    async readFile(relativePath: string): Promise<Uint8Array> {
      const resolved = resolveLogicalPath(snapshot, relativePath);
      await validateResolvedPath(resolved, false);
      return vscode.workspace.fs.readFile(toLogicalUri(resolved));
    },

    async writeFile(relativePath: string, content: Uint8Array): Promise<void> {
      const resolved = resolveLogicalPath(snapshot, relativePath);
      await validateResolvedPath(resolved, true);
      await vscode.workspace.fs.writeFile(toLogicalUri(resolved), content);
      inlinePreview.clear();
    },

    async stat(relativePath: string): Promise<ToolWorkspaceStat> {
      if (relativePath === "." && snapshot.folders.length > 1) {
        return { type: "directory", size: 0 };
      }
      const stat = await vscode.workspace.fs.stat(toResolvedUri(snapshot, relativePath));
      return {
        type: toEntryType(stat.type),
        size: stat.size,
      };
    },

    async createParentDirectory(relativePath: string): Promise<void> {
      const resolved = resolveLogicalPath(snapshot, relativePath);
      const parentPath = path.posix.dirname(resolved.relativePath);
      if (!parentPath || parentPath === ".") {
        return;
      }
      const parent = { ...resolved, relativePath: parentPath };
      await validateResolvedPath(parent, true);
      await vscode.workspace.fs.createDirectory(toLogicalUri(parent));
    },

    async readDirectory(relativePath: string): Promise<Array<[string, ToolWorkspaceEntryType]>> {
      if (relativePath === "." && snapshot.folders.length > 1) {
        return snapshot.folders.map((folder) => [folder.alias, "directory"]);
      }
      const entries = await vscode.workspace.fs.readDirectory(toResolvedUri(snapshot, relativePath));
      return entries.map(([name, type]) => [name, toEntryType(type)]);
    },

    async prepareFileDiff(relativePath: string, before: string, after: string): Promise<void> {
      const originalUri = toResolvedUri(snapshot, relativePath);
      await inlinePreview.show(originalUri, before, after);
    },

    clearFileDiffPreview(): void {
      inlinePreview.clear();
    },
  };
}

interface LogicalPath {
  folder: WorkspaceFolderSnapshot;
  relativePath: string;
  logicalPath: string;
}

function resolveLogicalPath(snapshot: WorkspaceRunSnapshot, rawPath: string): LogicalPath {
  if (typeof rawPath !== "string" || !rawPath.trim() || rawPath.includes("\0")) {
    throw new Error("Workspace path is required");
  }
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === ".." || normalized.split("/").includes("..")) {
    throw new Error("Workspace path cannot contain '..' traversal");
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalized) || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    throw new Error("Workspace path must be relative to the selected workspace");
  }
  if (snapshot.folders.length === 0) {
    throw new Error("No workspace folder open");
  }
  if (snapshot.folders.length === 1) {
    const folder = snapshot.folders[0]!;
    const withoutOptionalAlias = normalized === folder.alias
      ? "."
      : normalized.startsWith(`${folder.alias}/`) ? normalized.slice(folder.alias.length + 1) : normalized;
    return { folder, relativePath: withoutOptionalAlias || ".", logicalPath: withoutOptionalAlias || "." };
  }
  const [alias, ...segments] = normalized.split("/");
  const folder = snapshot.folders.find((candidate) => candidate.alias === alias);
  if (!folder) {
    throw new Error(`Multi-root workspace paths must start with one of: ${snapshot.folders.map((item) => item.alias).join(", ")}`);
  }
  const relativePath = segments.join("/") || ".";
  return { folder, relativePath, logicalPath: `${folder.alias}${relativePath === "." ? "" : `/${relativePath}`}` };
}

function isVirtualWorkspaceRoot(snapshot: WorkspaceRunSnapshot, rawPath: string): boolean {
  return snapshot.folders.length > 1 && rawPath.replace(/\\/g, "/").replace(/^\.\//, "") === ".";
}

function toResolvedUri(snapshot: WorkspaceRunSnapshot, logicalPath: string): vscode.Uri {
  const resolved = resolveLogicalPath(snapshot, logicalPath);
  return toLogicalUri(resolved);
}

function toLogicalUri(resolved: LogicalPath): vscode.Uri {
  return resolved.relativePath === "." ? resolved.folder.rootUri : vscode.Uri.joinPath(resolved.folder.rootUri, resolved.relativePath);
}

async function validateResolvedPath(resolved: LogicalPath, allowSensitive: boolean): Promise<void> {
  if (!allowSensitive && isSensitiveWorkspacePath(resolved.relativePath)) {
    throw new Error("Workspace path points to a sensitive file");
  }
  if (resolved.folder.rootUri.scheme === "file") {
    await resolveWorkspacePathSecure(
      resolved.relativePath,
      resolved.folder.rootUri.fsPath,
      realpath,
      { allowSensitive: true },
    );
    return;
  }
  await rejectVisibleRemoteSymlink(resolved.folder.rootUri, resolved.relativePath);
}

function formatLogicalPath(snapshot: WorkspaceRunSnapshot, folder: WorkspaceFolderSnapshot, relativePath: string): string {
  return snapshot.folders.length > 1 ? `${folder.alias}/${relativePath}` : relativePath;
}

function resolveDefaultLocalFolder(snapshot: WorkspaceRunSnapshot): LogicalPath {
  const folder = snapshot.folders.find((candidate) => candidate.alias === snapshot.defaultFolderAlias) ??
    (snapshot.folders.length === 1 ? snapshot.folders[0] : undefined);
  if (!folder) {
    throw new Error(`Terminal cwd is required. Choose one of: ${snapshot.folders.map((item) => item.alias).join(", ")}`);
  }
  return { folder, relativePath: ".", logicalPath: folder.alias };
}

function resolveSearchPatterns(snapshot: WorkspaceRunSnapshot, rawPattern: string): Array<{ folder: WorkspaceFolderSnapshot; pattern: string }> {
  const pattern = rawPattern.replace(/\\/g, "/").replace(/^\.\//, "") || "**/*";
  if (pattern.split("/").includes("..") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(pattern) || path.posix.isAbsolute(pattern) || path.win32.isAbsolute(pattern)) {
    throw new Error("Search pattern must stay inside the workspace");
  }
  if (snapshot.folders.length > 1) {
    const [candidateAlias, ...rest] = pattern.split("/");
    const folder = snapshot.folders.find((item) => item.alias === candidateAlias);
    if (folder) {
      return [{ folder, pattern: rest.join("/") || "**/*" }];
    }
  }
  return snapshot.folders.map((folder) => ({ folder, pattern }));
}

async function findFilesInRoot(rootUri: vscode.Uri, pattern: string, maxResults: number, signal?: AbortSignal): Promise<vscode.Uri[]> {
  const cancellation = new vscode.CancellationTokenSource();
  const onAbort = () => cancellation.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const resources = await vscode.workspace.findFiles(new vscode.RelativePattern(rootUri, pattern), undefined, maxResults, cancellation.token);
    if (signal?.aborted) {throw createAbortError();}
    return resources;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    cancellation.dispose();
  }
}

async function rejectVisibleRemoteSymlink(rootUri: vscode.Uri, relativePath: string): Promise<void> {
  let current = rootUri;
  for (const segment of relativePath.split("/").filter((part) => part && part !== ".")) {
    current = vscode.Uri.joinPath(current, segment);
    try {
      const stat = await vscode.workspace.fs.stat(current);
      if ((stat.type & vscode.FileType.SymbolicLink) !== 0) {
        throw new Error("Symbolic links are not allowed for remote workspace operations");
      }
    } catch (error: unknown) {
      if (isMissingWorkspaceResource(error)) {return;}
      throw error;
    }
  }
}

function isMissingWorkspaceResource(error: unknown): boolean {
  return error instanceof Error && (error.message.includes("FileNotFound") || error.message.includes("Unable to resolve"));
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
