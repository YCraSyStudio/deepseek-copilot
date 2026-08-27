import { spawn, type ChildProcess } from "child_process";
import { realpath } from "fs/promises";
import { getToolWorkspaceHost, resolveWorkspacePathSecure } from "@/infrastructure/tools/ToolWorkspace";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const MIN_OUTPUT_BYTES = 4 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const OUTPUT_DRAIN_GRACE_MS = 500;
const TERMINATION_GRACE_MS = 1_500;
const activeChildren = new Set<ChildProcess>();

export interface WorkspaceCommandOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface WorkspaceCommandResult {
  kind: "command_result";
  command: string;
  cwd: string;
  shell: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: false;
  durationMs: number;
  truncated: { stdout: boolean; stderr: boolean };
  terminationConfirmed?: boolean;
}

export interface CommandEnvironment {
  cwd: string;
  shell: string;
  workspaceRoot: string;
}

export async function resolveCommandEnvironment(cwd?: string): Promise<CommandEnvironment> {
  const workspace = getToolWorkspaceHost();
  const shell = workspace.getCommandShell?.()
    ?? (process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : (process.env.SHELL ?? "/bin/sh"));
  if (workspace.resolveLocalPath) {
    const resolved = await workspace.resolveLocalPath(cwd);
    if (!resolved.workspaceRoot) {
      throw new Error("Terminal workspace root is unavailable");
    }
    return {
      cwd: resolved.absolutePath,
      shell,
      workspaceRoot: resolved.workspaceRoot,
    };
  }
  const rootPath = workspace.getRootPath();
  if (!rootPath) {
    throw new Error("No workspace folder open");
  }
  const workDir = cwd ? (await resolveWorkspacePathSecure(cwd, rootPath, realpath)).absolutePath : rootPath;
  return {
    cwd: workDir,
    shell,
    workspaceRoot: rootPath,
  };
}

export async function executeWorkspaceCommand(command: string, options: WorkspaceCommandOptions = {}): Promise<WorkspaceCommandResult> {
  const environment = await resolveCommandEnvironment(options.cwd);
  const timeoutMs = clampInteger(options.timeoutMs, MIN_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS);
  const maxOutputBytes = clampInteger(options.maxOutputBytes, MIN_OUTPUT_BYTES, MAX_OUTPUT_BYTES, DEFAULT_MAX_OUTPUT_BYTES);

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const hostExecutor = getToolWorkspaceHost().executeCommand;
  if (hostExecutor) {
    const result = await hostExecutor(command, {
      cwd: environment.cwd,
      workspaceRoot: environment.workspaceRoot,
      signal: options.signal,
      timeoutMs,
      maxOutputBytes,
    });
    return {
      kind: "command_result",
      command,
      cwd: environment.cwd,
      shell: result.shell ?? environment.shell,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      cancelled: false,
      durationMs: result.durationMs,
      truncated: result.truncated,
      terminationConfirmed: result.terminationConfirmed,
    };
  }

  const startedAt = performance.now();

  return new Promise<WorkspaceCommandResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd: environment.cwd,
      shell: environment.shell,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    const stdout = new BoundedOutput(maxOutputBytes);
    const stderr = new BoundedOutput(maxOutputBytes);
    let settled = false;
    let timedOut = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let terminationConfirmed: boolean | undefined;
    let terminationStarted = false;

    child.stdout?.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.append(chunk));

    const cleanup = () => {
      clearTimeout(timeout);
      if (drainTimer) {clearTimeout(drainTimer);}
      options.signal?.removeEventListener("abort", onAbort);
      activeChildren.delete(child);
    };
    const finish = (callback: () => void) => {
      if (settled) {return;}
      settled = true;
      cleanup();
      callback();
    };
    const resolveResult = () => finish(() => resolve({
      kind: "command_result",
      command,
      cwd: environment.cwd,
      shell: environment.shell,
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode,
      signal: exitSignal,
      timedOut,
      cancelled: false,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      truncated: { stdout: stdout.truncated, stderr: stderr.truncated },
      terminationConfirmed,
    }));
    const terminateAndBoundSettlement = (after: () => void) => {
      if (terminationStarted || settled) {return;}
      terminationStarted = true;
      void terminateProcessTree(child).then((confirmed) => {
        terminationConfirmed = confirmed;
        child.stdout?.destroy();
        child.stderr?.destroy();
        after();
      });
    };
    const onAbort = () => {
      terminateAndBoundSettlement(() => finish(() => reject(createAbortError(terminationConfirmed))));
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateAndBoundSettlement(resolveResult);
    }, timeoutMs);

    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      if (terminationStarted) {return;}
      drainTimer = setTimeout(() => {
        // A detached descendant can inherit stdout/stderr after the shell exits,
        // preventing Node's "close" event forever. This tool never permits a
        // background process to outlive its finite command invocation.
        terminateAndBoundSettlement(resolveResult);
      }, OUTPUT_DRAIN_GRACE_MS);
    });
    child.once("close", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      if (terminationStarted) {return;}
      resolveResult();
    });
    if (options.signal?.aborted) {onAbort();}
  });
}

export class BoundedOutput {
  private readonly head: Buffer[] = [];
  private readonly tail: Buffer[] = [];
  private headBytes = 0;
  private tailBytes = 0;
  private readonly half: number;
  truncated = false;

  constructor(private readonly limit: number) {
    this.half = Math.floor(limit / 2);
  }

  append(chunk: Buffer): void {
    if (this.headBytes < this.half) {
      const take = Math.min(chunk.byteLength, this.half - this.headBytes);
      this.head.push(chunk.subarray(0, take));
      this.headBytes += take;
      chunk = chunk.subarray(take);
    }
    if (chunk.byteLength === 0) {return;}
    this.truncated = this.truncated || this.headBytes + this.tailBytes + chunk.byteLength > this.limit;
    this.tail.push(chunk);
    this.tailBytes += chunk.byteLength;
    while (this.tailBytes > this.limit - this.half && this.tail.length > 0) {
      const overflow = this.tailBytes - (this.limit - this.half);
      const first = this.tail[0];
      if (first.byteLength <= overflow) {
        this.tail.shift();
        this.tailBytes -= first.byteLength;
      } else {
        this.tail[0] = first.subarray(overflow);
        this.tailBytes -= overflow;
      }
    }
  }

  toString(): string {
    const marker = this.truncated ? Buffer.from("\n...[output truncated; middle omitted]...\n") : Buffer.alloc(0);
    return Buffer.concat([...this.head, marker, ...this.tail]).toString("utf8");
  }
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value!)) : fallback;
}

export async function shutdownOwnedProcesses(): Promise<void> {
  await Promise.allSettled([...activeChildren].map((child) => terminateProcessTree(child)));
}

async function terminateProcessTree(child: ChildProcess): Promise<boolean> {
  if (!child.pid || hasExited(child)) {return true;}
  if (process.platform === "win32") {
    return runBoundedTaskkill(child);
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  if (await waitForExit(child, TERMINATION_GRACE_MS / 2)) {return true;}
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
  return waitForExit(child, TERMINATION_GRACE_MS / 2);
}

function runBoundedTaskkill(child: ChildProcess): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanup = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) {return;}
      settled = true;
      clearTimeout(timer);
      resolve(confirmed);
    };
    const timer = setTimeout(() => {
      cleanup.kill();
      finish(false);
    }, TERMINATION_GRACE_MS);
    cleanup.once("error", () => finish(false));
    cleanup.once("close", (code) => finish(code === 0 || hasExited(child)));
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasExited(child)) {return Promise.resolve(true);}
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(hasExited(child));
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function createAbortError(terminationConfirmed?: boolean): Error {
  const error = new Error("Command execution cancelled");
  error.name = "AbortError";
  Object.assign(error, { terminationConfirmed });
  return error;
}
