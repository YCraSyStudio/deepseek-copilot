import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeSearxngEndpoint } from "@/infrastructure/browser/SearxngSearch";

const execFileAsync = promisify(execFile);
const DEFAULT_SEARXNG_URL = "http://127.0.0.1:8888";
const SEARXNG_IMAGE = "docker.io/searxng/searxng:latest";

type ContainerRuntime = "docker" | "podman";

interface ManagedInstance {
  runtime: ContainerRuntime;
  containerName: string;
  endpoint: string;
}

export class SearxngManager implements vscode.Disposable {
  private managed?: ManagedInstance;
  private resolving?: Promise<string>;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolve(configuredUrl: string): Promise<string> {
    const normalized = normalizeSearxngEndpoint(configuredUrl).toString().replace(/\/$/, "");
    if (await isSearxngAvailable(normalized)) {return normalized;}
    if (normalized !== DEFAULT_SEARXNG_URL) {
      throw new Error(`Configured SearXNG endpoint is unavailable: ${normalized}`);
    }
    if (this.managed && await isSearxngAvailable(this.managed.endpoint)) {return this.managed.endpoint;}
    if (!this.resolving) {
      this.resolving = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Starting local SearXNG",
        cancellable: false,
      }, async () => this.startManaged()).finally(() => {this.resolving = undefined;});
    }
    return this.resolving;
  }

  async stopManaged(): Promise<void> {
    const current = this.managed;
    this.managed = undefined;
    if (!current) {return;}
    await runContainerCommand(current.runtime, ["rm", "-f", current.containerName]).catch(() => undefined);
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      managed: this.managed !== undefined,
      endpoint: this.managed?.endpoint,
      runtime: this.managed?.runtime,
      image: SEARXNG_IMAGE,
    };
  }

  dispose(): void {
    void this.stopManaged();
  }

  private async startManaged(): Promise<string> {
    const runtime = await resolveContainerRuntime();
    const port = await findAvailablePort();
    const configDir = path.join(this.context.globalStorageUri.fsPath, "searxng");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, "settings.yml"), createSettings(), { encoding: "utf8", mode: 0o600 });

    const containerName = `deepseek-copilot-searxng-${process.pid}-${randomBytes(4).toString("hex")}`;
    const endpoint = `http://127.0.0.1:${port}`;
    const mount = `${configDir}:/etc/searxng:ro`;
    await runContainerCommand(runtime, [
      "run", "--rm", "-d",
      "--name", containerName,
      "-p", `127.0.0.1:${port}:8080`,
      "-e", "FORCE_OWNERSHIP=false",
      "-v", mount,
      SEARXNG_IMAGE,
    ]);

    const candidate: ManagedInstance = { runtime, containerName, endpoint };
    this.managed = candidate;
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await isSearxngAvailable(endpoint)) {return endpoint;}
        await delay(250);
      }
      throw new Error("Local SearXNG container started but did not become ready");
    } catch (error) {
      this.managed = undefined;
      await runContainerCommand(runtime, ["rm", "-f", containerName]).catch(() => undefined);
      throw error;
    }
  }
}

async function resolveContainerRuntime(): Promise<ContainerRuntime> {
  for (const runtime of ["docker", "podman"] as const) {
    try {
      await runContainerCommand(runtime, ["version", "--format", "{{.Server.Version}}"], 5_000);
      return runtime;
    } catch {continue;}
  }
  throw new Error("Managed SearXNG requires Docker or Podman, or configure an existing SearXNG endpoint");
}

async function runContainerCommand(runtime: ContainerRuntime, args: string[], timeout = 120_000): Promise<void> {
  await execFileAsync(runtime, args, {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

async function isSearxngAvailable(endpoint: string): Promise<boolean> {
  const base = normalizeSearxngEndpoint(endpoint);
  base.pathname = `${base.pathname}/config`.replace(/^\/\//, "/");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(base, { headers: { accept: "application/json" }, redirect: "error", signal: controller.signal });
    if (!response.ok) {return false;}
    const config = await response.json() as unknown;
    return !!config && typeof config === "object" && typeof (config as { instance_name?: unknown }).instance_name === "string";
  } catch {return false;}
  finally {clearTimeout(timer);}
}

async function findAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port for SearXNG"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function createSettings(): string {
  return `use_default_settings: true\n\ngeneral:\n  debug: false\n  instance_name: "DeepSeek Copilot Search"\n  enable_metrics: false\n\nsearch:\n  safe_search: 0\n  autocomplete: ""\n  formats:\n    - json\n\nserver:\n  secret_key: "${randomBytes(32).toString("hex")}"\n  limiter: false\n  public_instance: false\n  image_proxy: false\n\noutgoing:\n  request_timeout: 4.0\n  max_request_timeout: 8.0\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
