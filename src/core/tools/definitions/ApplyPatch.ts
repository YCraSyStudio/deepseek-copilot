import { createHash } from "crypto";
import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolMetadata } from "../Types";
import { getToolWorkspaceHost } from "../ToolWorkspace";
import { bufferLooksBinary, createStructuredResult, createUnifiedDiff } from "./StructuredResult";

interface ApplyPatchArgs {
  path: string;
  diff: string;
  expectedBeforeHash?: string;
}

interface PreparedPatch {
  before: string;
  after: string;
  beforeHash: string;
  afterHash: string;
  diff: ReturnType<typeof createUnifiedDiff>;
}

async function handleApplyPatch(args: Record<string, unknown>): Promise<string> {
  const parsed = parseApplyPatchArgs(args);
  if (typeof parsed === "string") {
    return parsed;
  }

  const preview = await preparePatch(parsed, { showDiffPreview: true });
  if (typeof preview === "string") {
    return preview;
  }

  return JSON.stringify({
    requiresConfirmation: true,
    dangerLevel: "caution",
    warningMessage: `Apply patch to "${parsed.path}"?`,
    filePath: parsed.path,
    beforeHash: preview.beforeHash,
  });
}

async function handleApplyPatchForced(args: Record<string, unknown>): Promise<string> {
  const parsed = parseApplyPatchArgs(args);
  if (typeof parsed === "string") {
    return parsed;
  }

  const preview = await preparePatch(parsed, { showDiffPreview: false });
  if (typeof preview === "string") {
    return preview;
  }

  try {
    await getToolWorkspaceHost().writeFile(parsed.path, Buffer.from(preview.after, "utf-8"));
    return createStructuredResult("filePatch", {
      path: parsed.path,
      beforeHash: preview.beforeHash,
      afterHash: preview.afterHash,
      diff: preview.diff.content,
      diffTruncated: preview.diff.truncated,
      diffStats: preview.diff.stats,
      beforeSize: Buffer.byteLength(preview.before, "utf-8"),
      afterSize: Buffer.byteLength(preview.after, "utf-8"),
      summary: `Patched ${parsed.path}: +${preview.diff.stats.additions} -${preview.diff.stats.deletions}`,
    });
  } catch (err: unknown) {
    return `Error applying patch to '${parsed.path}': ${getErrorMessage(err)}`;
  }
}

async function preparePatch(args: ApplyPatchArgs, options: { showDiffPreview: boolean }): Promise<PreparedPatch | string> {
  try {
    const workspace = getToolWorkspaceHost();
    const content = await workspace.readFile(args.path);
    if (bufferLooksBinary(content)) {
      return `Error applying patch to '${args.path}': binary files are not supported`;
    }

    const before = Buffer.from(content).toString("utf-8");
    const beforeHash = hashBytes(content);
    if (args.expectedBeforeHash && args.expectedBeforeHash !== beforeHash) {
      return `Error applying patch to '${args.path}': file changed since it was read. Expected sha256 ${args.expectedBeforeHash}, got ${beforeHash}.`;
    }

    const after = applyUnifiedDiff(before, args.diff, args.path);
    const afterHash = hashText(after);
    const diff = createUnifiedDiff({ filePath: args.path, before, after });

    if (options.showDiffPreview) {
      try {
        await workspace.prepareFileDiff?.(args.path, before, after);
      } catch {
        // Native diff preview is best-effort; the returned result still includes a unified diff.
      }
    }

    return { before, after, beforeHash, afterHash, diff };
  } catch (err: unknown) {
    return `Error applying patch to '${args.path}': ${getErrorMessage(err)}`;
  }
}

function parseApplyPatchArgs(args: Record<string, unknown>): ApplyPatchArgs | string {
  const filePath = args.path;
  const diff = args.diff ?? args.patch;
  const expectedBeforeHash = args.expectedBeforeHash;

  if (typeof filePath !== "string" || filePath.trim() === "") {
    return "Error: path parameter is required";
  }
  if (typeof diff !== "string" || diff.trim() === "") {
    return "Error: diff parameter is required";
  }
  if (expectedBeforeHash !== undefined && typeof expectedBeforeHash !== "string") {
    return "Error: expectedBeforeHash must be a string when provided";
  }

  return {
    path: filePath,
    diff,
    expectedBeforeHash,
  };
}

function applyUnifiedDiff(before: string, diff: string, filePath: string): string {
  const beforeLines = splitLines(before);
  const diffLines = diff.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let beforeIndex = 0;
  let lineIndex = 0;
  let sawHunk = false;

  while (lineIndex < diffLines.length) {
    const line = diffLines[lineIndex];
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.trim() === "") {
      lineIndex += 1;
      continue;
    }

    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (!hunkMatch) {
      throw new Error(`invalid unified diff for ${filePath}`);
    }

    sawHunk = true;
    const oldStart = Number(hunkMatch[1]);
    const hunkStartIndex = oldStart > 0 ? oldStart - 1 : 0;
    if (hunkStartIndex < beforeIndex) {
      throw new Error(`overlapping hunk in patch for ${filePath}`);
    }

    output.push(...beforeLines.slice(beforeIndex, hunkStartIndex));
    beforeIndex = hunkStartIndex;
    lineIndex += 1;

    while (lineIndex < diffLines.length && !diffLines[lineIndex].startsWith("@@ ")) {
      const hunkLine = diffLines[lineIndex];
      if (hunkLine.startsWith("\\ No newline at end of file")) {
        lineIndex += 1;
        continue;
      }

      const marker = hunkLine[0];
      const text = hunkLine.slice(1);
      if (marker === " ") {
        assertBeforeLine(beforeLines, beforeIndex, text, filePath);
        output.push(text);
        beforeIndex += 1;
      } else if (marker === "-") {
        assertBeforeLine(beforeLines, beforeIndex, text, filePath);
        beforeIndex += 1;
      } else if (marker === "+") {
        output.push(text);
      } else if (hunkLine === "") {
        throw new Error(`invalid empty hunk line in patch for ${filePath}`);
      } else {
        break;
      }
      lineIndex += 1;
    }
  }

  if (!sawHunk) {
    throw new Error(`patch for ${filePath} does not contain any hunks`);
  }

  output.push(...beforeLines.slice(beforeIndex));
  return joinLines(output, before.endsWith("\n"));
}

function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }
  return content.endsWith("\n") ? content.slice(0, -1).split("\n") : content.split("\n");
}

function joinLines(lines: string[], hadTrailingNewline: boolean): string {
  const joined = lines.join("\n");
  return hadTrailingNewline ? `${joined}\n` : joined;
}

function assertBeforeLine(beforeLines: string[], index: number, expected: string, filePath: string): void {
  const actual = beforeLines[index];
  if (actual !== expected) {
    throw new Error(`patch context mismatch in ${filePath} at line ${index + 1}`);
  }
}

function hashText(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

function hashBytes(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const applyPatchDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "apply_patch",
    description:
      "Apply a unified diff to one existing text file. Read the file first and pass expectedBeforeHash from read_file when possible. Shows a native diff preview and requires user confirmation before writing.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path. Use an absolute path only for explicitly requested external access.",
        },
        diff: {
          type: "string",
          description: "Unified diff hunks for this single file.",
        },
        expectedBeforeHash: {
          type: "string",
          description: "Optional sha256 from the latest read_file result. If provided, the patch fails when the file changed.",
        },
      },
      required: ["path", "diff"],
      additionalProperties: false,
    },
  },
};

export const applyPatchHandler: RegisteredTool["handler"] = handleApplyPatch;
export const applyPatchHandlerForced: RegisteredTool["handler"] = handleApplyPatchForced;

export const applyPatchMetadata: ToolMetadata = {
  dangerLevel: "caution",
  warningMessage: "This applies a patch to an existing workspace file.",
  requiresConfirmation: true,
};
