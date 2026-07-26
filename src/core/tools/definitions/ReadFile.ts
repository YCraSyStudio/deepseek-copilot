import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolMetadata } from "../Types";
import { getToolWorkspaceHost } from "../ToolWorkspace";
import { bufferLooksBinary, createStructuredResult, toTextPreview } from "./StructuredResult";
import { createHash } from "crypto";

async function handleReadFile(args: Record<string, unknown>): Promise<string> {
  const filePath = args.path as string;
  if (!filePath) {
    return "Error: path parameter is required";
  }

  try {
    const content = await getToolWorkspaceHost().readFile(filePath);
    if (bufferLooksBinary(content)) {
      return createStructuredResult("file", {
        path: filePath,
        binary: true,
        size: content.byteLength,
        content: "",
      });
    }

    const preview = toTextPreview(content);
    return createStructuredResult("file", {
      path: filePath,
      binary: false,
      size: content.byteLength,
      previewSize: Buffer.byteLength(preview.content, "utf-8"),
      truncated: preview.truncated,
      sha256: createHash("sha256").update(content).digest("hex"),
      content: preview.content,
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
