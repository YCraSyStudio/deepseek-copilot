import * as vscode from "vscode";
import { ToolRegistry } from "@/application/tools";
import { createHeadlessWebTools } from "@/infrastructure/browser/BrowserTools";
import { HeadlessWebRuntime } from "@/infrastructure/browser/HeadlessWebRuntime";
import { BUILT_IN_TOOLS } from "@/infrastructure/tools/builtins";
import { BrowserManager } from "@/platform/vscode/tools/browser/BrowserManager";
import { configureWebRuntimeDiagnostics } from "@/platform/vscode/tools/browser/Diagnostics";
import { SearxngManager } from "@/platform/vscode/tools/browser/SearxngManager";
import {
  HistoryManager,
  SettingsManager,
} from "@/platform/vscode/storage";
import {
  VsCodeSecretStore,
  VsCodeSettingsRepository,
} from "@/platform/vscode/storage/RepositoryAdapters";
import { WebviewProvider } from "@/platform/vscode/webviews/WebviewProvider";
import { DeepSeekModelProviderFactory } from "@/infrastructure/deepseek/DeepSeekModelProviderFactory";

export class ExtensionCompositionRoot implements vscode.Disposable {
  readonly settings = new VsCodeSettingsRepository();
  readonly secrets: VsCodeSecretStore;
  readonly history: HistoryManager;
  readonly browserManager: BrowserManager;
  readonly searxngManager: SearxngManager;
  readonly webRuntime: HeadlessWebRuntime;
  readonly toolRegistry: ToolRegistry;
  readonly webviewProvider: WebviewProvider;
  private readonly disposables: vscode.Disposable[];

  constructor(context: vscode.ExtensionContext) {
    this.secrets = new VsCodeSecretStore(context);
    this.history = new HistoryManager(context, this.settings);
    this.browserManager = new BrowserManager(context);
    this.searxngManager = new SearxngManager(context);
    this.webRuntime = new HeadlessWebRuntime(this.browserManager);
    configureWebRuntimeDiagnostics(this.webRuntime, this.settings);

    this.toolRegistry = new ToolRegistry();
    for (const tool of BUILT_IN_TOOLS) {this.toolRegistry.register(tool);}
    for (const tool of createHeadlessWebTools(this.webRuntime, {
      configuredEngine: () => this.settings.load().webSearchEngine,
      systemLocale: () => Intl.DateTimeFormat().resolvedOptions().locale,
      vscodeLanguage: () => vscode.env.language,
      resolveSearxngUrl: () => this.searxngManager.resolve(this.settings.load().searxngUrl),
    })) {
      this.toolRegistry.register(tool);
    }

    this.webviewProvider = new WebviewProvider(context.extensionUri, context, {
      historyManager: this.history,
      toolRegistry: this.toolRegistry,
      headlessWebRuntime: this.webRuntime,
      settings: this.settings,
      secrets: this.secrets,
      modelProviderFactory: new DeepSeekModelProviderFactory(),
    });
    this.disposables = [this.searxngManager, ...registerBrowserCommands(context, this.browserManager)];
    context.subscriptions.push(...this.disposables);
  }

  async initialize(): Promise<void> {
    await this.webviewProvider.initialize();
  }

  dispose(): void {
    this.webviewProvider.dispose();
  }
}

function registerBrowserCommands(
  _context: vscode.ExtensionContext,
  browserManager: BrowserManager,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("yrs-dpsk-copilot.installChromiumHeadless", async () => {
      const executable = await browserManager.installManaged();
      await vscode.window.showInformationMessage(`Chromium Headless ${executable.buildId ?? ""} installed.`);
    }),
    vscode.commands.registerCommand("yrs-dpsk-copilot.removeChromiumHeadless", async () => {
      await browserManager.removeManaged();
      await vscode.window.showInformationMessage("Managed Chromium Headless removed.");
    }),
    vscode.commands.registerCommand("yrs-dpsk-copilot.updateChromiumHeadless", async () => {
      const executable = await browserManager.installManaged();
      await vscode.window.showInformationMessage(`Chromium Headless ${executable.buildId ?? ""} is up to date.`);
    }),
  ];
}
