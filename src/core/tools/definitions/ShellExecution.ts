import { spawn, spawnSync, type ChildProcess } from "child_process";
import { realpath } from "fs/promises";
import { getToolWorkspaceHost, resolveWorkspacePathSecure } from "../ToolWorkspace";

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
export const MIN_COMMAND_TIMEOUT_MS = 1_000;
export const MAX_COMMAND_TIMEOUT_MS = 120_000;
export const MIN_OUTPUT_BYTES = 4 * 1024;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

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
}

export interface CommandEnvironment {
  cwd: string;
  shell: string;
  workspaceRoot: string;
}

export async function resolveCommandEnvironment(cwd?: string): Promise<CommandEnvironment> {
  const workspace = getToolWorkspaceHost();
  if (workspace.resolveLocalPath) {
    const resolved = await workspace.resolveLocalPath(cwd);
    if (!resolved.workspaceRoot) {
      throw new Error("Terminal workspace root is unavailable");
    }
    return {
      cwd: resolved.absolutePath,
      shell: process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : (process.env.SHELL ?? "/bin/sh"),
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
    shell: process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : (process.env.SHELL ?? "/bin/sh"),
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

  const startedAt = performance.now();

  return new Promise<WorkspaceCommandResult>((resolve, reject) => {
    const child = spawn(command, {
      cwd: environment.cwd,
      shell: environment.shell,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = new BoundedOutput(maxOutputBytes);
    const stderr = new BoundedOutput(maxOutputBytes);
    let settled = false;
    let timedOut = false;

    child.stdout?.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.append(chunk));

    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) {return;}
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      terminateProcessTree(child);
      finish(() => reject(createAbortError()));
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);

    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (exitCode, exitSignal) => {
      finish(() => resolve({
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
      }));
    });
    if (options.signal?.aborted) {onAbort();}
  });
}

class BoundedOutput {
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

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid) {return;}
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}

function createAbortError(): Error {
  const error = new Error("Command execution cancelled");
  error.name = "AbortError";
  return error;
}
