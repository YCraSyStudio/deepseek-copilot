import * as path from "node:path";
import { realpath } from "node:fs/promises";
import type { DangerLevel } from "../Types";
import { resolveWorkspacePathSecure } from "../ToolWorkspace";

export type ShellFamily = "posix" | "cmd" | "powershell" | "unknown";

export interface TerminalAnalysisContext {
  shell: string;
  cwd: string;
  workspaceRoot: string;
}

export interface TerminalDangerAnalysis {
  level: DangerLevel;
  message?: string;
  reasonCode: string;
  normalizedCommand?: string;
  workspaceContained: boolean;
  shellFamily: ShellFamily;
}

interface DangerousPattern { pattern: RegExp; level: DangerLevel; message: string; reasonCode: string }
interface ParsedCommand { tokens: string[]; normalizedCommand: string }
interface ReadOnlyForm { pathOperands: string[] }

const PATTERNS: DangerousPattern[] = [
  { pattern: /\b(?:rm\s+-(?:rf|fr)|remove-item\b[^\r\n;|]*(?:-recurse|-force)|rmdir\s+\/s|del\s+\/(?:f|s|q))\b/i, level: "destructive", message: "This command can recursively or forcibly delete files.", reasonCode: "destructive-delete" },
  { pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*[fd][a-z]*|push\b[^\r\n;|]*--force|push\s+origin\s+--delete|update-ref\s+-d)\b/i, level: "destructive", message: "This Git operation can permanently discard data or rewrite remote history.", reasonCode: "destructive-git" },
  { pattern: /\b(?:format(?:-volume)?|clear-disk|initialize-disk|mkfs|fdisk|parted|diskpart|dd)\b/i, level: "destructive", message: "Disk and filesystem operations can destroy data.", reasonCode: "destructive-disk" },
  { pattern: /\b(?:curl|wget|invoke-webrequest|iwr)\b[^|]*\|\s*(?:&\s*)?\b(?:bash|sh|zsh|powershell|pwsh|iex|invoke-expression)\b/i, level: "destructive", message: "Executing downloaded content directly is unsafe.", reasonCode: "download-execute" },
  { pattern: /\b(?:npm|pnpm|yarn|bun|vsce|ovsx)\s+publish\b/i, level: "dangerous", message: "Publishing has external side effects.", reasonCode: "publish" },
  { pattern: /\b(?:firebase|vercel|netlify|wrangler|kubectl|helm|terraform)\s+(?:deploy|publish|apply|destroy)\b/i, level: "dangerous", message: "Deployment or infrastructure changes have external side effects.", reasonCode: "deployment" },
  { pattern: /\b(?:git\s+push|gh\s+(?:pr|release)|npm\s+(?:login|token)|docker\s+push)\b/i, level: "dangerous", message: "This command changes remote state or credentials.", reasonCode: "remote-mutation" },
  { pattern: /\b(?:sudo|runas|start-process\b[^\r\n;|]*-verb\s+runas|set-executionpolicy)\b/i, level: "dangerous", message: "Elevated execution can modify the system.", reasonCode: "elevation" },
  { pattern: /\b(?:git\s+checkout\s+--|git\s+branch\s+-D|chmod\s+-R|move-item|copy-item|new-item|set-content|add-content|out-file|tee-object)\b/i, level: "dangerous", message: "This command can overwrite or discard files.", reasonCode: "filesystem-mutation" },
  { pattern: /\b(?:rm|del|erase|rmdir|remove-item)\b/i, level: "caution", message: "This command deletes files.", reasonCode: "delete" },
  { pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|exec|dlx|run)\b/i, level: "caution", message: "Package manager commands can execute scripts and modify the workspace.", reasonCode: "package-manager" },
];

const GIT_FORMS: Record<string, ReadonlySet<string>> = {
  status: new Set(["--short", "-s", "--branch", "-b", "--porcelain", "--porcelain=v1", "--porcelain=v2", "--show-stash", "--ahead-behind", "--no-ahead-behind", "--untracked-files=no", "--untracked-files=normal", "--untracked-files=all", "--ignored=no", "--ignored=matching", "--ignored=traditional"]),
  diff: new Set(["--cached", "--staged", "--stat", "--shortstat", "--numstat", "--name-only", "--name-status", "--summary", "--check", "--no-color", "--color=never", "--word-diff=plain", "-w", "--ignore-space-at-eol"]),
  log: new Set(["--oneline", "--decorate", "--no-decorate", "--stat", "--shortstat", "--name-only", "--name-status", "--no-color", "--color=never", "--all", "--branches", "--tags", "--remotes", "--first-parent"]),
  show: new Set(["--stat", "--shortstat", "--numstat", "--name-only", "--name-status", "--summary", "--no-color", "--color=never", "--oneline"]),
  "ls-files": new Set(["--cached", "--deleted", "--modified", "--others", "--ignored", "--stage", "--unmerged", "--killed", "--directory", "--no-empty-directory", "--exclude-standard"]),
};

const UNKNOWN_MESSAGE = "Unknown or unsupported shell syntax requires explicit confirmation.";

export async function analyzeDangerLevel(command: string, context: TerminalAnalysisContext): Promise<TerminalDangerAnalysis> {
  const shellFamily = identifyShellFamily(context.shell);
  const matched = PATTERNS.find((item) => item.pattern.test(command));
  const likelyWorkspaceContained = isLikelyWorkspaceContained(command, matched?.reasonCode);
  if (matched && matched.level === "destructive") {
    return result(matched.level, matched.message, matched.reasonCode, shellFamily, undefined, likelyWorkspaceContained);
  }
  if (shellFamily === "unknown") {
    return result(matched?.level ?? "caution", matched?.message ?? "The resolved shell is not supported by the read-only allowlist.", "unknown-shell", shellFamily, undefined, likelyWorkspaceContained);
  }

  const parsed = tokenize(command, shellFamily);
  if (!parsed) {
    return result(matched?.level ?? classifyUnsupportedSyntax(command), matched?.message ?? UNKNOWN_MESSAGE, "unsupported-syntax", shellFamily, undefined, likelyWorkspaceContained);
  }

  const form = classifyReadOnlyForm(parsed.tokens, shellFamily);
  if (!form) {
    return result(matched?.level ?? "caution", matched?.message ?? "This command form is not in the read-only allowlist.", matched?.reasonCode ?? "not-allowlisted", shellFamily, parsed.normalizedCommand, likelyWorkspaceContained);
  }

  for (const operand of form.pathOperands) {
    if (!isReviewableRelativePath(operand)) {
      return result("caution", "A path operand cannot be proven to stay inside the workspace.", "unreviewable-path", shellFamily, parsed.normalizedCommand);
    }
    try {
      await resolveWorkspacePathSecure(path.resolve(context.cwd, operand), context.workspaceRoot, realpath, { allowSensitive: true });
    } catch {
      return result("caution", "A path operand resolves outside the workspace or through an untrusted link.", "outside-workspace", shellFamily, parsed.normalizedCommand);
    }
  }

  return {
    level: "safe",
    reasonCode: "allowlisted-read-only",
    normalizedCommand: parsed.normalizedCommand,
    workspaceContained: true,
    shellFamily,
  };
}

export function identifyShellFamily(shell: string): ShellFamily {
  const executable = path.basename(shell.trim().replace(/^["']|["']$/g, "")).toLowerCase();
  if (executable === "cmd" || executable === "cmd.exe") {return "cmd";}
  if (executable === "powershell" || executable === "powershell.exe" || executable === "pwsh" || executable === "pwsh.exe") {return "powershell";}
  if (["sh", "bash", "zsh", "dash", "ksh", "fish"].includes(executable)) {return "posix";}
  return "unknown";
}

function tokenize(command: string, family: ShellFamily): ParsedCommand | null {
  if (!command.trim() || /[\r\n\0]/.test(command)) {return null;}
  const forbiddenOutside = family === "posix" ? /[|&;<>(){}[\]?*~$`#\\]/ : family === "cmd" ? /[|&<>()^%!\r\n]/ : /[|&;<>(){}[\]?*~$`@#,\\]/;
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote) {
      if (char === quote) {
        if (family === "powershell" && quote === "'" && command[index + 1] === "'") {
          token += "'";
          index += 1;
        } else {
          quote = null;
        }
        continue;
      }
      if (quote === '"' && (family === "powershell" || /[$`\\%!\^]/.test(char))) {return null;}
      token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      if (family === "cmd" && char === "'") {return null;}
      if (family === "powershell" && char === '"') {return null;}
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }
    if (forbiddenOutside.test(char)) {return null;}
    token += char;
  }
  if (quote) {return null;}
  if (token) {tokens.push(token);}
  if (tokens.length === 0) {return null;}
  return { tokens, normalizedCommand: tokens.map((value) => JSON.stringify(value)).join(" ") };
}

function classifyReadOnlyForm(tokens: string[], family: ShellFamily): ReadOnlyForm | null {
  if (!isBareExecutable(tokens[0]!)) {return null;}
  const program = normalizeProgram(tokens[0]!, family);
  const args = tokens.slice(1);
  if (program === "git") {return classifyGit(args);}

  if (family === "posix") {
    if ((program === "pwd" && args.every((arg) => arg === "-L" || arg === "-P")) || (program === "whoami" && args.length === 0)) {
      return { pathOperands: [] };
    }
    if (program === "echo" || program === "printf") {return { pathOperands: [] };}
    if (program === "ls") {return pathCommand(args, /^-[alhtrR1dF]+$|^--color=never$/);}
    if (program === "cat") {return pathCommand(args, /^-[nbsETAv]+$/);}
    if (program === "head" || program === "tail") {return pathCommand(args, /^-[vcq]+$/);}
    if (program === "grep") {return classifyGrep(args);}
  }

  if (family === "cmd") {
    if ((program === "whoami" || program === "ver") && args.length === 0) {return { pathOperands: [] };}
    if (program === "echo") {return { pathOperands: [] };}
    if (program === "dir") {return pathCommand(args, /^\/[ABCDLOPQRSWXYZ0-9:.-]+$/i);}
    if (program === "type") {return args.length > 0 && args.every((arg) => !arg.startsWith("/")) ? { pathOperands: args } : null;}
    if (program === "where") {return args.length > 0 && args.every((arg) => /^[\w.-]+$/.test(arg)) ? { pathOperands: [] } : null;}
  }

  if (family === "powershell") {
    if ((program === "get-location" || program === "pwd") && args.length === 0) {return { pathOperands: [] };}
    if (program === "get-childitem" || program === "get-child-item" || program === "ls" || program === "dir") {
      return powershellPathCommand(args, new Set(["-force", "-name", "-recurse", "-file", "-directory", "-hidden"]));
    }
    if (program === "get-content" || program === "cat" || program === "type") {
      return powershellPathCommand(args, new Set(["-raw"]));
    }
    if (program === "select-string") {return classifyPowerShellSelectString(args);}
  }
  return null;
}

function classifyGit(args: string[]): ReadOnlyForm | null {
  if (args.length === 0 || args[0]!.startsWith("-")) {return null;}
  const subcommand = args[0]!.toLowerCase();
  const rest = args.slice(1);
  if (subcommand === "branch") {
    return rest.length === 1 && rest[0] === "--show-current" ? { pathOperands: [] } : null;
  }
  if (subcommand === "rev-parse") {
    const allowed = new Set(["--show-toplevel", "--show-prefix", "--show-cdup", "--is-inside-work-tree", "--is-bare-repository", "--show-superproject-working-tree", "--abbrev-ref", "HEAD"]);
    return rest.length > 0 && rest.every((arg) => allowed.has(arg)) ? { pathOperands: [] } : null;
  }
  const allowedFlags = GIT_FORMS[subcommand];
  if (!allowedFlags) {return null;}
  const separator = rest.indexOf("--");
  const beforePaths = separator >= 0 ? rest.slice(0, separator) : rest;
  const pathOperands = separator >= 0 ? rest.slice(separator + 1) : [];
  if (subcommand === "status" && separator < 0) {
    const firstPath = beforePaths.findIndex((arg) => !arg.startsWith("-"));
    if (firstPath >= 0) {
      pathOperands.push(...beforePaths.splice(firstPath));
    }
  }
  for (const arg of beforePaths) {
    if (arg.startsWith("-") && !allowedFlags.has(arg)) {return null;}
  }
  return { pathOperands };
}

function pathCommand(args: string[], allowedOption: RegExp): ReadOnlyForm | null {
  const paths: string[] = [];
  let optionsEnded = false;
  for (const arg of args) {
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && arg.startsWith("-")) {
      if (!allowedOption.test(arg)) {return null;}
    } else {
      paths.push(arg);
    }
  }
  return { pathOperands: paths };
}

function classifyGrep(args: string[]): ReadOnlyForm | null {
  const allowed = /^-[nivFElcHh]+$/;
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("-")) {
      if (!allowed.test(arg)) {return null;}
    } else {
      positional.push(arg);
    }
  }
  return positional.length >= 1 ? { pathOperands: positional.slice(1) } : null;
}

function powershellPathCommand(args: string[], switches: ReadonlySet<string>): ReadOnlyForm | null {
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const lower = arg.toLowerCase();
    if (switches.has(lower)) {continue;}
    if (lower === "-path" || lower === "-literalpath") {
      const value = args[++index];
      if (!value) {return null;}
      paths.push(value);
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      paths.push(arg);
    }
  }
  return { pathOperands: paths };
}

function classifyPowerShellSelectString(args: string[]): ReadOnlyForm | null {
  const paths: string[] = [];
  let hasPattern = false;
  for (let index = 0; index < args.length; index += 1) {
    const lower = args[index]!.toLowerCase();
    if (lower === "-simplematch" || lower === "-casesensitive" || lower === "-quiet") {continue;}
    if (lower === "-pattern") {
      if (!args[++index]) {return null;}
      hasPattern = true;
    } else if (lower === "-path" || lower === "-literalpath") {
      const value = args[++index];
      if (!value) {return null;}
      paths.push(value);
    } else {
      return null;
    }
  }
  return hasPattern ? { pathOperands: paths } : null;
}

function normalizeProgram(program: string, family: ShellFamily): string {
  const base = path.basename(program).toLowerCase();
  return family === "cmd" && base.endsWith(".exe") ? base.slice(0, -4) : base;
}

function isBareExecutable(program: string): boolean {
  return !program.includes("/") && !program.includes("\\") && !program.includes(":") && program !== "." && program !== "..";
}

function isReviewableRelativePath(value: string): boolean {
  return value !== "" &&
    value !== "-" &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    !value.split(/[\\/]/).includes("..") &&
    !/^(?:~|\\\\|[a-zA-Z][\w+.-]*:)/.test(value) &&
    !/[*?\[\]{}]/.test(value);
}

function classifyUnsupportedSyntax(command: string): DangerLevel {
  if (/(?:^|[^>])>>?|<|[|;&]|\$\(|`|%[^%]+%|\$env:|-[Ee]ncodedCommand\b|\biex\b/i.test(command)) {
    return "dangerous";
  }
  return "caution";
}

function isLikelyWorkspaceContained(command: string, reasonCode?: string): boolean {
  if (reasonCode && new Set([
    "destructive-disk",
    "download-execute",
    "publish",
    "deployment",
    "remote-mutation",
    "elevation",
  ]).has(reasonCode)) {
    return false;
  }
  return !(
    /(?:^|[\s"'=])(?:[a-zA-Z]:[\\/]|\\\\|\/(?![/?]))/.test(command) ||
    /(?:^|[\s"'\\/])\.\.(?:$|[\s"'\\/])/.test(command) ||
    /(?:^|[\s"'=])~(?:$|[\\/])/.test(command) ||
    /\$\(|`|%[^%]+%|\$(?:env:)?[A-Za-z_{]|![A-Za-z_][A-Za-z0-9_]*!|file:\/\//i.test(command)
  );
}

function result(
  level: DangerLevel,
  message: string,
  reasonCode: string,
  shellFamily: ShellFamily,
  normalizedCommand?: string,
  workspaceContained = false,
): TerminalDangerAnalysis {
  return { level, message, reasonCode, normalizedCommand, workspaceContained, shellFamily };
}
