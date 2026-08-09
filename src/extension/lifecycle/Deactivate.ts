import { shutdownActiveProvider } from "./ExtensionRuntime";
import { shutdownOwnedProcesses } from "@/infrastructure/tools/builtins/terminal/ShellExecution";

export async function deactivate(): Promise<void> {
  try {
    await shutdownActiveProvider();
  } finally {
    await shutdownOwnedProcesses();
  }
}
