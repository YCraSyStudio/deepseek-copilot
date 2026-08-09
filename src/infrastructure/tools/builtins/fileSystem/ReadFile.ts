import type { ToolDefinition } from "@/contracts";
import type { RegisteredTool, ToolMetadata } from "@/application/tools/Types";
import { getToolWorkspaceHost } from "@/infrastructure/tools/ToolWorkspace";
import { bufferLooksBinary, createStructuredResult, toTextPreview } from "./StructuredResult";
import { createHash } from "crypto";

const MAX_READ_PREVIEW_BYTES = 128 * 1024;

async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  if (!filePath) {
    return "Error: path parameter is required";
  }

  try {
    const workspace = getToolWorkspaceHost();
    const preview = workspace.readFilePreview
      ? await workspace.readFilePreview(filePath, MAX_READ_PREVIEW_BYTES)
      : undefined;
    const content = preview
      ? Buffer.concat([Buffer.from(preview.head), ...(preview.tail ? [Buffer.from("\n...[middle omitted]...\n"), Buffer.from(preview.tail)] : [])])
      : await workspace.readFile(filePath);
    if (bufferLooksBinary(content)) {
      return createStructuredResult("file", {
        path: filePath,
        binary: true,
        size: content.byteLength,
        content: "",
      });
    }

    const textPreview = toTextPreview(content);
    const complete = !preview || preview.size <= MAX_READ_PREVIEW_BYTES;
    return createStructuredResult("file", {
      path: filePath,
      binary: false,
      size: preview?.size ?? content.byteLength,
      previewSize: Buffer.byteLength(textPreview.content, "utf-8"),
      truncated: textPreview.truncated || !complete,
      ...(complete ? { sha256: createHash("sha256").update(content).digest("hex") } : {}),
      content: textPreview.content,
    });
  } catch (err: unknown) {
    return `Error reading file '${filePath}': ${getErrorMessage(err)}`;
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const readFileDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read the contents of a file in the current project. The path is relative to the workspace root.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path, for example src/Main.ts. Use an absolute path only when the user explicitly requests access outside the workspace and the active permission mode allows it.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const readFileHandler: RegisteredTool["handler"] = handleReadFile;

export const readFileMetadata: ToolMetadata = {
  dangerLevel: "safe",
  requiresConfirmation: false,
};
