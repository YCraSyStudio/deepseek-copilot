import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolMetadata } from "../Types";
import { getToolWorkspaceHost } from "../ToolWorkspace";
import { bufferLooksBinary, createStructuredResult, createUnifiedDiff } from "./StructuredResult";
import { createHash } from "crypto";

interface EditFileArgs {
  path: string;
  search: string;
  replace: string;
  replaceAll: boolean;
  expectedBeforeHash?: string;
}

async function handleEditFile(args: Record<string, unknown>): Promise<string> {
  const parsed = parseEditFileArgs(args);
  if (typeof parsed === "string") {
    return parsed;
  }

  const preview = await prepareEdit(parsed, { showDiffPreview: true });
  if (typeof preview === "string") {
    return preview;
  }

  return JSON.stringify({
    requiresConfirmation: true,
    dangerLevel: "caution",
    warningMessage: `Apply ${preview.replacementCount} replacement${preview.replacementCount === 1 ? "" : "s"} to "${parsed.path}"?`,
    filePath: parsed.path,
    beforeHash: preview.beforeHash,
  });
}

async function handleEditFileForced(args: Record<string, unknown>): Promise<string> {
  const parsed = parseEditFileArgs(args);
  if (typeof parsed === "string") {
    return parsed;
  }

  const preview = await prepareEdit(parsed, { showDiffPreview: false });
  if (typeof preview === "string") {
    return preview;
  }

  try {
    await getToolWorkspaceHost().writeFile(parsed.path, Buffer.from(preview.after, "utf-8"));
    return createStructuredResult("fileEdit", {
      path: parsed.path,
      replacementCount: preview.replacementCount,
      diff: preview.diff.content,
      diffTruncated: preview.diff.truncated,
      diffStats: preview.diff.stats,
      beforeSize: Buffer.byteLength(preview.before, "utf-8"),
      afterSize: Buffer.byteLength(preview.after, "utf-8"),
      summary: `Edited ${parsed.path}: ${preview.replacementCount} replacement${preview.replacementCount === 1 ? "" : "s"}`,
    });
  } catch (err: unknown) {
    return `Error editing file '${parsed.path}': ${getErrorMessage(err)}`;
  }
}

async function prepareEdit(
  args: EditFileArgs,
  options: { showDiffPreview: boolean },
): Promise<
  | string
  | {
      before: string;
      after: string;
      replacementCount: number;
      diff: ReturnType<typeof createUnifiedDiff>;
      beforeHash: string;
    }
> {
  try {
    const workspace = getToolWorkspaceHost();
    const content = await workspace.readFile(args.path);
    if (bufferLooksBinary(content)) {
      return `Error editing file '${args.path}': binary files are not supported`;
    }

    const before = Buffer.from(content).toString("utf-8");
    const beforeHash = createHash("sha256").update(content).digest("hex");
    if (args.expectedBeforeHash && args.expectedBeforeHash !== beforeHash) {
      return `Error editing file '${args.path}': file changed after confirmation. Expected sha256 ${args.expectedBeforeHash}, got ${beforeHash}.`;
    }
    const replacementCount = countOccurrences(before, args.search);
    if (replacementCount === 0) {
      return `Error editing file '${args.path}': search text not found`;
    }
    if (replacementCount > 1 && !args.replaceAll) {
      return `Error editing file '${args.path}': search text matched ${replacementCount} times. Set replaceAll to true to replace every match.`;
    }

    const after = args.replaceAll ? before.split(args.search).join(args.replace) : before.replace(args.search, args.replace);
    const diff = createUnifiedDiff({ filePath: args.path, before, after });

    if (options.showDiffPreview) {
      try {
        await workspace.prepareFileDiff?.(args.path, before, after);
      } catch {
        // Diff preview is best-effort; the structured result still carries a unified diff.
      }
    }

    return {
      before,
      after,
      replacementCount: args.replaceAll ? replacementCount : 1,
      diff,
      beforeHash,
    };
  } catch (err: unknown) {
    return `Error editing file '${args.path}': ${getErrorMessage(err)}`;
  }
}

function parseEditFileArgs(args: Record<string, unknown>): EditFileArgs | string {
  const filePath = args.path;
  const search = args.search;
  const replace = args.replace;
  const replaceAll = args.replaceAll ?? false;
  const expectedBeforeHash = typeof args.expectedBeforeHash === "string" ? args.expectedBeforeHash : undefined;

  if (typeof filePath !== "string" || filePath.trim() === "") {
    return "Error: path parameter is required";
  }
  if (typeof search !== "string" || search.length === 0) {
    return "Error: search parameter is required and cannot be empty";
  }
  if (typeof replace !== "string") {
    return "Error: replace parameter is required";
  }
  if (typeof replaceAll !== "boolean") {
    return "Error: replaceAll parameter must be a boolean when provided";
  }

  return {
    path: filePath,
    search,
    replace,
    replaceAll,
    expectedBeforeHash,
  };
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const nextIndex = content.indexOf(search, index);
    if (nextIndex === -1) {
      return count;
    }
    count += 1;
    index = nextIndex + search.length;
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const editFileDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "Edit an existing text file by replacing exact search text. Fails when the search text is missing or matches multiple times unless replaceAll is true.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path. Use an absolute path only for explicitly requested external access.",
        },
        search: {
          type: "string",
          description: "Exact text to find. Must be non-empty.",
        },
        replace: {
          type: "string",
          description: "Replacement text.",
        },
        replaceAll: {
          type: "boolean",
          description: "Replace every occurrence. Required when search text appears more than once.",
        },
        expectedBeforeHash: {
          type: "string",
          description: "Optional sha256 used to reject the edit if the file changed after preview.",
        },
      },
      required: ["path", "search", "replace"],
      additionalProperties: false,
    },
  },
};

export const editFileHandler: RegisteredTool["handler"] = handleEditFile;
export const editFileHandlerForced: RegisteredTool["handler"] = handleEditFileForced;

export const editFileMetadata: ToolMetadata = {
  dangerLevel: "caution",
  warningMessage: "This edits an existing workspace file.",
  requiresConfirmation: true,
};
