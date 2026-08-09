import type { ToolDefinition } from "@/contracts";
import type { RegisteredTool, ToolMetadata } from "@/application/tools/Types";
import { getToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import { bufferLooksBinary, createStructuredResult, createUnifiedDiff, isMissingFileError } from "./StructuredResult";
import { createHash } from "crypto";

async function handleCreateFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  const content = (args.content as string) || "";

  if (!filePath) {
    return "Error: path parameter is required";
  }

  try {
    const workspace = getToolWorkspaceHost();

    let fileExists = false;
    try {
      await workspace.stat(filePath);
      fileExists = true;
    } catch (err: unknown) {
      if (isMissingFileError(err)) {
        // Missing files are expected when creating a new file.
      } else {
        return `Error checking if file "${filePath}" exists: ${getErrorMessage(err)}`;
      }
    }

    if (fileExists) {
      const existing = await readExistingFile(filePath);
      return JSON.stringify({
        requiresConfirmation: true,
        dangerLevel: "caution",
        warningMessage: `The file "${filePath}" already exists. Creating a new file will OVERWRITE it.`,
        filePath,
        beforeHash: existing?.hash,
      });
    }

    try {
      await workspace.createParentDirectory(filePath);
    } catch (err: unknown) {
      return `Error creating parent directories for "${filePath}": ${getErrorMessage(err)}`;
    }

    await workspace.writeFile(filePath, Buffer.from(content, "utf-8"));
    const diff = createUnifiedDiff({ filePath, before: "", after: content });
    return createStructuredResult("fileWrite", {
      path: filePath,
      overwritten: false,
      diff: diff.content,
      diffTruncated: diff.truncated,
      diffStats: diff.stats,
      afterSize: Buffer.byteLength(content, "utf-8"),
      afterHash: hashText(content),
      summary: `File created: ${filePath}`,
    });
  } catch (err: unknown) {
    return `Error creating file '${filePath}': ${getErrorMessage(err)}`;
  }
}

/**
 * Forced variant used after explicit user confirmation.
 */
async function handleCreateFileForced(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  const content = (args.content as string) || "";
  const expectedBeforeHash = args.expectedBeforeHash as string | undefined;

  if (!filePath) {
    return "Error: path parameter is required";
  }

  try {
    const workspace = getToolWorkspaceHost();

    const before = await readExistingFile(filePath);
    if (expectedBeforeHash === "missing" && before !== undefined) {
      return `Error creating file '${filePath}': a file appeared after approval.`;
    }
    if (expectedBeforeHash && expectedBeforeHash !== "missing" && before?.hash !== expectedBeforeHash) {
      return `Error overwriting file '${filePath}': file changed after confirmation.`;
    }

    try {
      await workspace.createParentDirectory(filePath);
    } catch (err: unknown) {
      return `Error creating parent directories for "${filePath}": ${getErrorMessage(err)}`;
    }

    await workspace.writeFile(filePath, Buffer.from(content, "utf-8"));
    const diff = before?.binary ? undefined : createUnifiedDiff({ filePath, before: before?.content || "", after: content });
    return createStructuredResult("fileWrite", {
      path: filePath,
      overwritten: before !== undefined,
      diff: diff?.content || "",
      diffTruncated: diff?.truncated || false,
      diffStats: diff?.stats,
      binary: before?.binary || false,
      beforeHash: before?.hash,
      beforeSize: before?.size,
      afterSize: Buffer.byteLength(content, "utf-8"),
      afterHash: hashText(content),
      summary: before !== undefined ? `File overwritten: ${filePath}` : `File created: ${filePath}`,
    });
  } catch (err: unknown) {
    return `Error creating file '${filePath}': ${getErrorMessage(err)}`;
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readExistingFile(filePath: string): Promise<{ content: string; size: number; binary: boolean; hash: string } | undefined> {
  try {
    const buffer = await getToolWorkspaceHost().readFile(filePath);
    const binary = bufferLooksBinary(buffer);
    return {
      content: binary ? "" : Buffer.from(buffer).toString("utf-8"),
      size: buffer.byteLength,
      binary,
      hash: createHash("sha256").update(buffer).digest("hex"),
    };
  } catch {
    return undefined;
  }
}

function hashText(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export const createFileDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "create_file",
    description:
      "Create a file with complete content and create parent directories when needed. If the file exists, this tool requests confirmation and then safely overwrites it; never use terminal redirection or a temporary-file move as a workaround.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path of the file to create. Use an absolute path only for explicitly requested external access.",
        },
        content: {
          type: "string",
          description: "File contents.",
        },
        expectedBeforeHash: {
          type: "string",
          description: "Internal sha256 guard used after overwrite confirmation.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const createFileHandler: RegisteredTool["handler"] = handleCreateFile;
export const createFileHandlerForced: RegisteredTool["handler"] = handleCreateFileForced;

export const createFileMetadata: ToolMetadata = {
  dangerLevel: "caution",
  warningMessage: "This will overwrite existing files without backup.",
  requiresConfirmation: true,
};
