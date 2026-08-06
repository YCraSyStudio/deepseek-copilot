import * as assert from "node:assert";
import { extractSearchResults } from "@/vscodeApi/tools/browser/BrowserContent";
import { createIntegratedBrowserTools } from "@/vscodeApi/tools/browser/BrowserTools";
import { IntegratedBrowserBridge } from "@/vscodeApi/tools/browser/IntegratedBrowserBridge";
import { getOrderedSearchProviders } from "@/vscodeApi/tools/browser/SearchProviders";
import { BROWSER_TOOL_IDS, type BrowserToolHost } from "@/vscodeApi/tools/browser/Types";
import { validateElementRef, validatePublicHttpsUrl } from "@/vscodeApi/tools/browser/Validation";

const ALL_BROWSER_TOOLS = Object.values(BROWSER_TOOL_IDS);

suite("integrated browser tools", () => {
  test("detects complete and partial VS Code browser capabilities", () => {
    const complete = new IntegratedBrowserBridge(createHost()).getCapabilities();
    const partial = new IntegratedBrowserBridge(createHost([BROWSER_TOOL_IDS.open])).getCapabilities();

    assert.strictEqual(complete.available, true);
    assert.strictEqual(complete.headless, false);
    assert.strictEqual(partial.available, false);
    assert.ok(partial.missingTools.includes(BROWSER_TOOL_IDS.read));
  });

  test("orders an explicit engine before automatic fallbacks", () => {
    assert.deepStrictEqual(
      getOrderedSearchProviders("Google", "Bing").map((provider) => provider.id),
      ["google", "duckduckgo", "bing", "yahoo"],
    );
    assert.deepStrictEqual(
      getOrderedSearchProviders("auto", "DuckDuckGo").map((provider) => provider.id),
      ["duckduckgo", "bing", "google", "yahoo"],
    );
  });

  test("extracts semantic links and normalizes redirected HTTPS results", () => {
    const snapshot = [
      '- link "TypeScript documentation" [ref=e12]:',
      '  - /url: https://www.google.com/url?q=https%3A%2F%2Fwww.typescriptlang.org%2Fdocs%2F',
      '  - text: Official TypeScript documentation and handbook',
    ].join("\n");

    const results = extractSearchResults(
      snapshot,
      "https://www.google.com/search?q=typescript",
      "google",
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0]?.title, "TypeScript documentation");
    assert.strictEqual(results[0]?.url, "https://www.typescriptlang.org/docs/");
    assert.strictEqual(results[0]?.ref, "e12");
    assert.match(results[0]?.snippet ?? "", /Official TypeScript/);
  });

  test("falls back to a second provider in the same browser page", async () => {
    const invocations: Array<{ name: string; input: Record<string, unknown> }> = [];
    const host = createHost(ALL_BROWSER_TOOLS, async (name, input) => {
      invocations.push({ name, input });
      if (name === BROWSER_TOOL_IDS.open) {
        return "Page ID: page-1\n\nCAPTCHA: verify you are human";
      }
      if (name === BROWSER_TOOL_IDS.navigate) {
        return [
          '- link "TypeScript documentation" [ref=e8]:',
          '  - /url: https://www.typescriptlang.org/docs/',
          '  - text: Official documentation',
        ].join("\n");
      }
      return "";
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const search = tools.find((tool) => tool.definition.function.name === "search_web");

    const result = JSON.parse(await search!.handler({ query: "TypeScript docs" })) as {
      provider: string;
      pageId: string;
      results: Array<{ url: string }>;
    };

    assert.strictEqual(result.provider, "bing");
    assert.strictEqual(result.pageId, "page-1");
    assert.strictEqual(result.results[0]?.url, "https://www.typescriptlang.org/docs/");
    assert.deepStrictEqual(invocations.map((entry) => entry.name), [
      BROWSER_TOOL_IDS.open,
      BROWSER_TOOL_IDS.navigate,
    ]);
  });

  test("rejects private URLs and invented element references", () => {
    for (const url of [
      "http://example.com",
      "https://localhost/admin",
      "https://127.0.0.1/",
      "https://192.168.1.2/",
      "https://[::ffff:127.0.0.1]/",
      "https://user:pass@example.com/",
    ]) {
      assert.throws(() => validatePublicHttpsUrl(url));
    }
    assert.strictEqual(validatePublicHttpsUrl("https://example.com/docs"), "https://example.com/docs");
    assert.throws(() => validateElementRef("a[href='https://example.com']"));
    assert.strictEqual(validateElementRef("e_12-a"), "e_12-a");
  });
});

function createHost(
  toolNames: readonly string[] = ALL_BROWSER_TOOLS,
  invoke: BrowserToolHost["invokeTool"] = async () => "",
): BrowserToolHost {
  return {
    getToolNames: () => toolNames,
    invokeTool: invoke,
    getSearchEnginePreference: () => "auto",
    getNativeSearchEnginePreference: () => undefined,
    getLocale: () => "es-ES",
    getChatToolsSetting: () => true,
  };
}
