import * as path from "node:path";

/**
 * Deterministic facts parsed from a proposed terminal command.
 *
 * Safety decisions for terminal commands and workspace scripts are made from
 * these facts, never from a model assertion. Anything this module cannot prove
 * is reported as `unknown` so the caller keeps requiring a review.
 */

type CommandClassification = "read-only-diagnostic" | "script-execution" | "unknown";
export type ScriptLanguage = "powershell" | "shell" | "javascript" | "python";

export interface ScriptInvocation {
  /** Interpreter program that runs the script, lowercased. */
  interpreter: string;
  /** Script operand exactly as written in the command. */
  path: string;
  /** Arguments passed to the script. */
  args: string[];
  language: ScriptLanguage;
}

export interface CommandFacts {
  classification: CommandClassification;
  /** Programs invoked by each shell segment, lowercased and without `.exe`. */
  programs: string[];
  /** Raw shell segments after splitting on `&&` and `;`. */
  segments: string[];
  /** Present only when the command runs a single workspace script. */
  script?: ScriptInvocation;
  /** True when execution policy is relaxed for one child process only. */
  processScopedPolicyBypass: boolean;
  /** True when the command changes machine or user execution policy. */
  changesExecutionPolicy: boolean;
  /** True when the command escalates privileges (`sudo`, `runas`, `RunAs`). */
  escalatesPrivileges: boolean;
}

const DIAGNOSTIC_FLAGS = new Set([
  "--version",
  "-version",
  "-v",
  "-V",
  "--help",
  "-h",
  "-?",
  "/?",
]);

/**
 * Programs whose version/help query is finite, local, and read-only. Extending
 * this list is the only way a new command becomes an automatic diagnostic.
 */
const DIAGNOSTIC_PROGRAMS = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bun", "deno", "corepack",
  "dotnet", "msbuild", "nuget",
  "python", "python3", "py", "pip", "pip3", "uv", "poetry", "pytest",
  "java", "javac", "mvn", "gradle",
  "go", "rustc", "cargo",
  "git", "gh", "svn",
  "docker", "podman", "kubectl", "helm", "terraform", "az", "gcloud", "aws",
  "code", "tsc", "mocha", "eslint", "prettier", "vite", "vitest", "jest",
  "composer", "ruby", "gem", "bundle", "php", "make", "cmake", "ninja",
  "gcc", "g++", "clang", "clang++", "ld",
  "sw_vers", "uname", "lsb_release", "openssl", "ffmpeg", "convert", "magick",
  "tar", "unzip", "zip", "7z", "git-lfs",
]);

/** Availability queries: `where node`, `which node`, `command -v node`. */
const AVAILABILITY_PROGRAMS = new Set(["where", "which"]);

interface InterpreterSpec {
  /** Flag that introduces the script path, when the interpreter needs one. */
  flag?: string;
  language: ScriptLanguage;
}

const INTERPRETERS = new Map<string, InterpreterSpec>([
  ["powershell", { flag: "-file", language: "powershell" }],
  ["pwsh", { flag: "-file", language: "powershell" }],
  ["bash", { language: "shell" }],
  ["sh", { language: "shell" }],
  ["zsh", { language: "shell" }],
  ["dash", { language: "shell" }],
  ["node", { language: "javascript" }],
  ["python", { language: "python" }],
  ["python3", { language: "python" }],
]);

/** Interpreter flags that turn a run into inline code instead of a script file. */
const INLINE_CODE_FLAGS = new Set(["-c", "-e", "--eval", "-p", "--print", "-i", "--interactive", "-command", "-encodedcommand"]);

const SCRIPT_LANGUAGES = new Map<string, ScriptLanguage>([
  [".ps1", "powershell"],
  [".psm1", "powershell"],
  [".sh", "shell"],
  [".bash", "shell"],
  [".zsh", "shell"],
  [".js", "javascript"],
  [".cjs", "javascript"],
  [".mjs", "javascript"],
  [".py", "python"],
]);

const PRIVILEGE_PROGRAMS = new Set(["sudo", "doas", "pkexec", "runas", "gsudo", "su"]);

export function parseCommandFacts(command: string): CommandFacts {
  const trimmed = typeof command === "string" ? command.trim() : "";
  const segments = splitShellSegments(trimmed);
  const tokensPerSegment = segments.map(tokenize);
  const programs = tokensPerSegment
    .map((tokens) => (tokens.length > 0 ? programName(tokens[0]!) : ""))
    .filter((name) => name.length > 0);

  const facts: CommandFacts = {
    classification: "unknown",
    programs,
    segments,
    processScopedPolicyBypass: hasProcessScopedPolicyBypass(tokensPerSegment),
    changesExecutionPolicy: changesExecutionPolicy(trimmed),
    escalatesPrivileges: escalatesPrivileges(trimmed, programs),
  };

  if (trimmed.length === 0 || hasUnsupportedShellSyntax(trimmed)) {
    return facts;
  }

  const script = segments.length === 1 ? detectScriptInvocation(tokensPerSegment[0]!) : undefined;
  if (script) {
    return { ...facts, classification: "script-execution", script };
  }
  if (isReadOnlyDiagnostic(tokensPerSegment)) {
    return { ...facts, classification: "read-only-diagnostic" };
  }
  return facts;
}

/** Stable form used for decision-cache keys and for logging. */
export function normalizeCommandForDecision(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

/**
 * Rejects commands whose effect cannot be proven from the segment text alone:
 * pipes, redirections, background execution, substitutions, and variables.
 */
function hasUnsupportedShellSyntax(command: string): boolean {
  return (
    /[\r\n]/.test(command) ||
    /[<>]/.test(command) ||
    /`/.test(command) ||
    /\$[({]/.test(command) ||
    /\|/.test(command) ||
    /(?<!&)&(?!&)/.test(command) ||
    /%/.test(command) ||
    /!/.test(command) ||
    /\^/.test(command)
  );
}

function isReadOnlyDiagnostic(tokensPerSegment: string[][]): boolean {
  if (tokensPerSegment.length === 0) {
    return false;
  }
  return tokensPerSegment.every((tokens) => isDiagnosticSegment(tokens));
}

function isDiagnosticSegment(tokens: string[]): boolean {
  if (tokens.length === 0) {
    return false;
  }
  const program = programName(tokens[0]!);
  const args = tokens.slice(1);
  if (args.some((arg) => INLINE_CODE_FLAGS.has(arg.toLowerCase()))) {
    return false;
  }
  if (AVAILABILITY_PROGRAMS.has(program)) {
    return args.length === 1 && isBareProgramName(args[0]!);
  }
  if (program === "command") {
    return args.length === 2 && args[0] === "-v" && isBareProgramName(args[1]!);
  }
  if (!DIAGNOSTIC_PROGRAMS.has(program)) {
    return false;
  }
  return args.length <= 1 && (args.length === 0 || DIAGNOSTIC_FLAGS.has(args[0]!));
}

function isBareProgramName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9._+-]*$/.test(value);
}

/** Detects a script run inside a single already-tokenized segment. */
export function detectScriptInvocation(tokens: string[]): ScriptInvocation | undefined {
  if (tokens.length === 0) {
    return undefined;
  }
  const interpreter = programName(tokens[0]!);
  const spec = INTERPRETERS.get(interpreter);
  if (!spec) {
    return undefined;
  }
  const args = tokens.slice(1);
  if (args.some((arg) => INLINE_CODE_FLAGS.has(arg.toLowerCase()))) {
    return undefined;
  }

  if (spec.flag) {
    const flagIndex = args.findIndex((arg) => arg.toLowerCase() === spec.flag);
    if (flagIndex < 0) {
      return undefined;
    }
    const scriptPath = args[flagIndex + 1];
    if (!scriptPath) {
      return undefined;
    }
    return {
      interpreter,
      path: scriptPath,
      args: args.slice(flagIndex + 2),
      language: spec.language,
    };
  }

  const scriptIndex = args.findIndex((arg) => !arg.startsWith("-") && looksLikeScriptPath(arg, spec.language));
  if (scriptIndex < 0) {
    return undefined;
  }
  return {
    interpreter,
    path: args[scriptIndex]!,
    args: args.slice(scriptIndex + 1),
    language: spec.language,
  };
}

function looksLikeScriptPath(value: string, language: ScriptLanguage): boolean {
  const extension = path.extname(value).toLowerCase();
  const mapped = SCRIPT_LANGUAGES.get(extension);
  if (!mapped || mapped !== language) {
    return false;
  }
  return !/[*?[\]{}]/.test(value);
}

function hasProcessScopedPolicyBypass(tokensPerSegment: string[][]): boolean {
  const values = new Set(["bypass", "unrestricted", "remotesigned", "allsigned"]);
  const flags = new Set(["-executionpolicy", "-ep"]);
  return tokensPerSegment.some((tokens) => {
    const interpreter = tokens.length > 0 ? programName(tokens[0]!) : "";
    if (interpreter !== "powershell" && interpreter !== "pwsh") {
      return false;
    }
    return tokens.some((token, index) => {
      if (!flags.has(token.toLowerCase())) {
        return false;
      }
      const value = tokens[index + 1];
      return Boolean(value && values.has(value.toLowerCase()));
    });
  });
}

function changesExecutionPolicy(command: string): boolean {
  if (!/\bSet-ExecutionPolicy\b/i.test(command)) {
    return false;
  }
  return !/\bSet-ExecutionPolicy\b[^\n]*?-Scope\s+Process\b/i.test(command);
}

function escalatesPrivileges(command: string, programs: string[]): boolean {
  if (programs.some((program) => PRIVILEGE_PROGRAMS.has(program))) {
    return true;
  }
  return /-Verb\s+RunAs\b/i.test(command);
}

function programName(token: string): string {
  return path.win32.basename(token).replace(/\.(?:exe|cmd|bat)$/i, "").toLowerCase();
}

/** Splits a command on `&&` and `;` while respecting quotes. */
function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;
    if (quote) {
      current += character;
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === ";" || character === "&") {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      while (command[index + 1] === character) {
        index += 1;
      }
      continue;
    }
    current += character;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

/** Tokenizes one shell segment, dropping quoting characters. */
function tokenize(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (const character of segment) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
