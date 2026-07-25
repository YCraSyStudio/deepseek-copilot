import { shutdownActiveProvider } from "./ExtensionRuntime";

export async function deactivate(): Promise<void> {
  await shutdownActiveProvider();
}
