import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { getSystemBrowserCandidates, type BrowserExecutable } from "@/infrastructure/browser/BrowserDiscovery";
import { DENIED_SANDBOX_BYPASS_ARGUMENT } from "@/infrastructure/browser/BrowserLaunchPolicy";
import {
  Browser as ManagedBrowser,
  Cache,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
} from "@puppeteer/browsers";

const HEADLESS_SHELL_BUILD = "151.0.7922.71";

export class BrowserManager {
  private resolved?: BrowserExecutable;
  private resolving?: Promise<BrowserExecutable>;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolve(allowInstall = true): Promise<BrowserExecutable> {
    if (this.resolved && await isFile(this.resolved.path)) {return this.resolved;}
    if (!this.resolving) {
      this.resolving = this.resolveInternal(allowInstall).finally(() => {this.resolving = undefined;});
    }
    return this.resolving;
  }

  async installManaged(): Promise<BrowserExecutable> {
    const platform = detectBrowserPlatform();
    if (!platform) {throw new Error(`Unsupported browser platform: ${process.platform}/${process.arch}`);}
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, "chromium-headless");
    const checksumKey = managedChecksumKey(String(platform));
    const installDir = new Cache(cacheDir).installationDir(ManagedBrowser.CHROMEHEADLESSSHELL, platform, HEADLESS_SHELL_BUILD);
    const installExisted = await directoryExists(installDir);
    let verifiedArchiveHash: string | undefined;
    await fs.mkdir(cacheDir, { recursive: true });
    const installed = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Downloading Chromium Headless",
      cancellable: true,
    }, async (progress, token) => {
      let archivePath: string | undefined;
      try {
        archivePath = await install({
          browser: ManagedBrowser.CHROMEHEADLESSSHELL,
          buildId: HEADLESS_SHELL_BUILD,
          platform,
          cacheDir,
          unpack: false,
          downloadProgressCallback: (downloaded, total) => progress.report({
            message: reportDownloadProgress(token, downloaded, total),
          }),
        });
        if (token.isCancellationRequested) {throw new vscode.CancellationError();}
        const actualHash = await sha256File(archivePath);
        const pinnedHash = this.context.globalState.get<string>(checksumKey);
        if (pinnedHash && !safeHashEqual(actualHash, pinnedHash)) {
          throw new Error("Chromium Headless archive checksum does not match the previously verified build");
        }
        await verifySha256File(archivePath, pinnedHash ?? actualHash);
        verifiedArchiveHash = actualHash;
        return await install({
          browser: ManagedBrowser.CHROMEHEADLESSSHELL,
          buildId: HEADLESS_SHELL_BUILD,
          platform,
          cacheDir,
          expectedHash: pinnedHash ?? actualHash,
        });
      } catch (error: unknown) {
        if (archivePath) {await fs.rm(archivePath, { force: true }).catch(() => undefined);}
        if (!installExisted) {await fs.rm(installDir, { recursive: true, force: true }).catch(() => undefined);}
        throw error;
      }
    });
    if (!await validatesWithCdp(installed.executablePath)) {
      await fs.rm(installed.path, { recursive: true, force: true }).catch(() => undefined);
      throw new Error("The downloaded Chromium Headless build is incompatible or cannot start with its sandbox enabled");
    }
    if (verifiedArchiveHash) {await this.context.globalState.update(checksumKey, verifiedArchiveHash);}
    await this.context.globalState.update(`${checksumKey}.executable`, await sha256File(installed.executablePath));
    this.resolved = { path: installed.executablePath, source: "managed-headless-shell", buildId: HEADLESS_SHELL_BUILD };
    return this.resolved;
  }

  async removeManaged(): Promise<void> {
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, "chromium-headless");
    await fs.rm(cacheDir, { recursive: true, force: true });
    const platform = detectBrowserPlatform();
    if (platform) {
      const checksumKey = managedChecksumKey(String(platform));
      await this.context.globalState.update(checksumKey, undefined);
      await this.context.globalState.update(`${checksumKey}.executable`, undefined);
    }
    if (this.resolved?.source === "managed-headless-shell") {this.resolved = undefined;}
  }

  getDiagnostics(): Record<string, unknown> {
    return {
      source: this.resolved?.source ?? "unresolved",
      buildId: this.resolved?.buildId,
      available: this.resolved !== undefined,
    };
  }

  private async resolveInternal(allowInstall: boolean): Promise<BrowserExecutable> {
    for (const candidate of getSystemBrowserCandidates()) {
      if (await isFile(candidate.path) && await validatesWithCdp(candidate.path)) {
        this.resolved = candidate;
        return candidate;
      }
    }
    const managed = await this.findManaged();
    if (managed) {this.resolved = managed; return managed;}
    if (!allowInstall) {throw new Error("No compatible Edge, Chrome, or managed Chromium Headless installation found");}
    const choice = await vscode.window.showWarningMessage(
      `No compatible Edge or Chrome installation was found. Download Chromium Headless ${HEADLESS_SHELL_BUILD} (approximately 100 MB) to ${this.context.globalStorageUri.fsPath}?`,
      { modal: true },
      "Download Chromium Headless",
    );
    if (choice !== "Download Chromium Headless") {throw new Error("Chromium Headless installation was cancelled");}
    return this.installManaged();
  }

  private async findManaged(): Promise<BrowserExecutable | undefined> {
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, "chromium-headless");
    const browsers = await getInstalledBrowsers({ cacheDir }).catch(() => []);
    const installed = browsers
      .find((browser) => browser.browser === ManagedBrowser.CHROMEHEADLESSSHELL && browser.buildId === HEADLESS_SHELL_BUILD);
    if (!installed) {return undefined;}
    const expectedExecutableHash = this.context.globalState.get<string>(`${managedChecksumKey(String(installed.platform))}.executable`);
    if (expectedExecutableHash && !safeHashEqual(await sha256File(installed.executablePath), expectedExecutableHash)) {
      await fs.rm(installed.path, { recursive: true, force: true }).catch(() => undefined);
      return undefined;
    }
    if (!await validatesWithCdp(installed.executablePath)) {
      await fs.rm(installed.path, { recursive: true, force: true }).catch(() => undefined);
      return undefined;
    }
    return { path: installed.executablePath, source: "managed-headless-shell", buildId: installed.buildId };
  }
}

async function isFile(value: string): Promise<boolean> {
  try {return (await fs.stat(value)).isFile();} catch {return false;}
}

async function directoryExists(value: string): Promise<boolean> {
  try {return (await fs.stat(value)).isDirectory();} catch {return false;}
}

async function validatesWithCdp(executablePath: string): Promise<boolean> {
  try {
    const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, ignoreDefaultArgs: [DENIED_SANDBOX_BYPASS_ARGUMENT], args: [
      "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
      "--disable-extensions", "--disable-sync", "--no-first-run", "--no-default-browser-check",
    ] });
    try {await browser.version(); return true;} finally {await browser.close();}
  } catch {return false;}
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function verifySha256File(filePath: string, expectedHash: string): Promise<void> {
  const actualHash = await sha256File(filePath);
  if (!safeHashEqual(actualHash, expectedHash)) {throw new Error("Chromium Headless archive checksum verification failed");}
}

function safeHashEqual(left: string, right: string): boolean {
  return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) && left === right;
}

function reportDownloadProgress(token: vscode.CancellationToken, downloaded: number, total: number): string {
  if (token.isCancellationRequested) {throw new vscode.CancellationError();}
  return total > 0 ? `${Math.floor(downloaded * 100 / total)}%` : `${Math.floor(downloaded / 1_048_576)} MB`;
}

function managedChecksumKey(platform: string): string {
  return `chromium-headless.sha256.${platform}.${HEADLESS_SHELL_BUILD}`;
}
