import * as vscode from "vscode";
import * as net from "node:net";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeSearxngEndpoint } from "@/infrastructure/browser/SearxngSearch";

const execFileAsync = promisify(execFile);
const DEFAULT_SEARXNG_URL = "http://127.0.0.1:8888";
const SEARXNG_IMAGE = "docker.io/searxng/searxng:latest";
const READY_ATTEMPTS = 80;
const READY_INTERVAL_MS = 250;

type ContainerRuntime = "docker" | "podman";

interface ManagedInstance {
  runtime: ContainerRuntime;
  containerName: string;
  volumeName: string;
  endpoint: string;
}

export class SearxngManager implements vscode.Disposable {
  private managed?: ManagedInstance;
  private resolving?: Promise<string>;

  constructor(private readonly _context: vscode.ExtensionContext) {}

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
    await removeManagedResources(current);
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
    const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
    const containerName = `deepseek-copilot-searxng-${suffix}`;
    const volumeName = `deepseek-copilot-searxng-config-${suffix}`;
    const endpoint = `http://127.0.0.1:${port}`;
    const candidate: ManagedInstance = { runtime, containerName, volumeName, endpoint };

    try {
      await runContainerCommand(runtime, ["volume", "create", volumeName]);
      await initializeConfigVolume(runtime, volumeName);
      await runContainerCommand(runtime, [
        "run", "--rm", "-d",
        "--name", containerName,
        "-p", `127.0.0.1:${port}:8080`,
        "-v", `${volumeName}:/etc/searxng`,
        SEARXNG_IMAGE,
      ]);
      this.managed = candidate;

      for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
        if (await isSearxngAvailable(endpoint)) {return endpoint;}
        await delay(READY_INTERVAL_MS);
      }
      throw new Error("Local SearXNG container started but did not become ready");
    } catch (error) {
      if (this.managed === candidate) {this.managed = undefined;}
      await removeManagedResources(candidate);
      throw error;
    }
  }
}

async function initializeConfigVolume(runtime: ContainerRuntime, volumeName: string): Promise<void> {
  await runContainerCommand(runtime, [
    "run", "--rm",
    "--user", "0:0",
    "--entrypoint", "/bin/sh",
    "-e", `DEEPSEEK_COPILOT_SEARXNG_SETTINGS=${createSettings()}`,
    "-v", `${volumeName}:/etc/searxng`,
    SEARXNG_IMAGE,
    "-c", "printf '%s' \"$DEEPSEEK_COPILOT_SEARXNG_SETTINGS\" > /etc/searxng/settings.yml && chmod 0644 /etc/searxng/settings.yml",
  ]);
}

async function removeManagedResources(instance: ManagedInstance): Promise<void> {
  await runContainerCommand(instance.runtime, ["rm", "-f", instance.containerName], 15_000).catch(() => undefined);
  await runContainerCommand(instance.runtime, ["volume", "rm", "-f", instance.volumeName], 15_000).catch(() => undefined);
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
  return `use_default_settings: true\n\ngeneral:\n  debug: false\n  instance_name: "DeepSeek Copilot Search"\n  enable_metrics: false\n\nsearch:\n  safe_search: 0\n  autocomplete: ""\n  formats:\n    - json\n\nserver:\n  bind_address: "0.0.0.0"\n  secret_key: "${randomBytes(32).toString("hex")}"\n  limiter: false\n  public_instance: false\n  image_proxy: false\n\noutgoing:\n  request_timeout: 4.0\n  max_request_timeout: 8.0\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
