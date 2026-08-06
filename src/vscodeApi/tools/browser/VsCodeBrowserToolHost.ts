import * as vscode from "vscode";
import type { BrowserToolHost, BrowserToolId } from "./Types";

const EXTENSION_SEARCH_SECTION = "yrs-dpsk-copilot.webSearch";

export function createVsCodeBrowserToolHost(): BrowserToolHost {
  return {
    getToolNames: () => vscode.lm.tools.map((tool) => tool.name),
    invokeTool: (name, input, signal) => invokeVsCodeTool(name, input, signal),
    getSearchEnginePreference: () =>
      vscode.workspace.getConfiguration(EXTENSION_SEARCH_SECTION).get<string>("engine"),
    getNativeSearchEnginePreference: () =>
      vscode.workspace.getConfiguration("workbench.browser").get<string>("searchEngine"),
    getLocale: () => vscode.env.language || Intl.DateTimeFormat().resolvedOptions().locale || "en",
    getChatToolsSetting: () =>
      vscode.workspace.getConfiguration("workbench.browser").get<boolean>("enableChatTools"),
  };
}

async function invokeVsCodeTool(
  name: BrowserToolId,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const cancellation = new vscode.CancellationTokenSource();
  const onAbort = (): void => cancellation.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) {
    cancellation.cancel();
  }

  try {
    const result = await vscode.lm.invokeTool(
      name,
      { toolInvocationToken: undefined, input },
      cancellation.token,
    );
    return result.content.flatMap((part) => {
      if (part && typeof part === "object" && "value" in part && typeof part.value === "string") {
        return [part.value];
      }
      return [];
    }).join("\n");
  } finally {
    signal?.removeEventListener("abort", onAbort);
    cancellation.dispose();
  }
}
