import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolHandlerContext, ToolMetadata } from "../../Types";
import { analyzeDangerLevel } from "./DangerAnalysis";
import { executeWorkspaceCommand, resolveCommandEnvironment } from "./ShellExecution";
import * as path from "node:path";

async function handleTerminalCommand(args: Record<string, unknown>, context?: ToolHandlerContext): Promise<string> {
  const normalized = normalizeLeadingDirectoryChange(
    args.command as string,
    args.cwd as string | undefined,
  );
  const command = normalized.command;
  const cwd = normalized.cwd;
  const timeoutMs = args.timeoutMs as number | undefined;
  const maxOutputBytes = args.maxOutputBytes as number | undefined;

  if (!command) {
    return "Error: command parameter is required";
  }

  const environment = await resolveCommandEnvironment(cwd);
  const analysis = await analyzeDangerLevel(command, environment);

  if (analysis.level !== "safe") {
    return JSON.stringify({
      requiresConfirmation: true,
      dangerLevel: analysis.level,
      warningMessage: analysis.message,
      command,
      cwd: environment.cwd,
      workspaceRoot: environment.workspaceRoot,
      shell: environment.shell,
      reasonCode: analysis.reasonCode,
      normalizedCommand: analysis.normalizedCommand,
      workspaceContained: analysis.workspaceContained,
    });
  }

  return JSON.stringify(await executeWorkspaceCommand(command, { cwd, signal: context?.signal, timeoutMs, maxOutputBytes }));
}

async function handleTerminalCommandForced(args: Record<string, unknown>, context?: ToolHandlerContext): Promise<string> {
  const normalized = normalizeLeadingDirectoryChange(
    args.command as string,
    args.cwd as string | undefined,
  );
  const command = normalized.command;
  const cwd = normalized.cwd;
  const timeoutMs = args.timeoutMs as number | undefined;
  const maxOutputBytes = args.maxOutputBytes as number | undefined;

  if (!command) {
    return "Error: command parameter is required";
  }

  return JSON.stringify(await executeWorkspaceCommand(command, { cwd, signal: context?.signal, timeoutMs, maxOutputBytes }));
}

export function normalizeLeadingDirectoryChange(
  command: string,
  cwd?: string,
): { command: string; cwd?: string } {
  if (!command) {
    return { command, cwd };
  }
  const match = command.match(
    /^\s*cd(?:\s+\/d)?\s+(?:"([^"]+)"|'([^']+)'|([^&|;\r\n]+?))\s*&&\s*(.+)$/i,
  );
  if (!match) {
    return { command, cwd };
  }
  const target = (match[1] ?? match[2] ?? match[3] ?? "").trim();
  const remainingCommand = (match[4] ?? "").trim();
  if (!target || !remainingCommand) {
    return { command, cwd };
  }
  const normalizedCwd = cwd && !path.isAbsolute(target)
    ? path.join(cwd, target)
    : target;
  return { command: remainingCommand, cwd: normalizedCwd };
}

export const terminalCommandDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "run_terminal_command",
    description:
      "Run one finite, non-interactive shell command. Stay inside the workspace unless the user explicitly requests external computer access and the active permission mode allows it. Never detach or leave background processes running. For temporary servers, start, verify, and stop them in the same command with guaranteed cleanup. The structured result is authoritative; do not add verification-only reads unless output is ambiguous or verification was requested. Commands cannot answer prompts or use a TTY.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to run.",
        },
        cwd: {
          type: "string",
          description: "Working directory relative to the workspace. Use an absolute path only for explicitly requested external access. Prefer this argument over cd.",
        },
        timeoutMs: {
          type: "integer",
          description: "Timeout in milliseconds (1000-120000). Defaults to 30000.",
          minimum: 1000,
          maximum: 120000,
        },
        maxOutputBytes: {
          type: "integer",
          description: "Maximum bytes retained per stdout/stderr stream (4096-4194304).",
          minimum: 4096,
          maximum: 4194304,
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

export const terminalCommandHandler: RegisteredTool["handler"] = handleTerminalCommand;
export const terminalCommandHandlerForced: RegisteredTool["handler"] = handleTerminalCommandForced;

export const terminalCommandMetadata: ToolMetadata = {
  dangerLevel: "dangerous",
  warningMessage: "Shell commands can modify, delete, or damage files. Review the command carefully before executing.",
  requiresConfirmation: true,
};
