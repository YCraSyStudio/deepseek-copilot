import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolMetadata } from "../../Types";
import { getToolWorkspaceHost } from "../../ToolWorkspace";

async function handleListDir(args: Record<string, unknown>): Promise<string> {
  const dirPath = (args.path as string) || ".";
  const showHidden = (args.showHidden as boolean) || false;

  try {
    const entries = await getToolWorkspaceHost().readDirectory(dirPath);
    const excluded = new Set(["node_modules", ".git", ".vscode", "dist", "build"]);

    const items = entries
      .filter(([name]) => showHidden || !name.startsWith("."))
      .filter(([name]) => !excluded.has(name))
      .map(([name, type]) => {
        const icon = type === "directory" ? "[dir]" : "[file]";
        return `${icon} ${name}`;
      });

    if (items.length === 0) {
      return `(empty directory: ${dirPath})`;
    }

    return `Contents of ${dirPath}:\n${items.join("\n")}`;
  } catch (err: unknown) {
    return `Error listing directory '${dirPath}': ${getErrorMessage(err)}`;
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const listDirDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "list_directory",
    description: "List files and directories at a project path. Excludes node_modules, .git, dist, build, and hidden files by default.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path. Defaults to the root. Use an absolute path only for explicitly requested external access.",
        },
        showHidden: {
          type: "boolean",
          description: "Show hidden files, meaning files whose names start with a dot.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const listDirHandler: RegisteredTool["handler"] = handleListDir;

export const listDirMetadata: ToolMetadata = {
  dangerLevel: "safe",
  requiresConfirmation: false,
};
