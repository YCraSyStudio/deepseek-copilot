import * as assert from "node:assert";
import {
  extractSearchResultsDetailed,
  normalizeSearchResultUrl,
} from "@/vscodeApi/tools/browser/BrowserContent";
import { createIntegratedBrowserTools } from "@/vscodeApi/tools/browser/BrowserTools";
import {
  extractBrowserPages,
  IntegratedBrowserBridge,
} from "@/vscodeApi/tools/browser/IntegratedBrowserBridge";
import {
  getOrderedSearchProviders,
  resolveSearchLocale,
} from "@/vscodeApi/tools/browser/SearchProviders";
import { BROWSER_TOOL_IDS, type BrowserToolHost } from "@/vscodeApi/tools/browser/Types";
import { validateElementRef, validatePublicHttpsUrl } from "@/vscodeApi/tools/browser/Validation";

const ALL_BROWSER_TOOLS = Object.values(BROWSER_TOOL_IDS);

suite("integrated browser tools", () => {
  test("reports optimized and compatible browser capabilities", () => {
    const complete = new IntegratedBrowserBridge(createHost()).getCapabilities();
    const compatible = new IntegratedBrowserBridge(createHost([
      BROWSER_TOOL_IDS.open,
      BROWSER_TOOL_IDS.read,
      BROWSER_TOOL_IDS.navigate,
      BROWSER_TOOL_IDS.click,
    ])).getCapabilities();
    const partial = new IntegratedBrowserBridge(createHost([BROWSER_TOOL_IDS.open])).getCapabilities();

    assert.strictEqual(complete.available, true);
    assert.strictEqual(complete.optimized, true);
    assert.strictEqual(complete.headless, false);
    assert.strictEqual(compatible.available, true);
    assert.strictEqual(compatible.optimized, false);
    assert.ok(compatible.missingOptimizedTools.includes(BROWSER_TOOL_IDS.type));
    assert.strictEqual(partial.available, false);
  });

  test("parses the native list_browser_pages format used by VS Code", () => {
    assert.deepStrictEqual(extractBrowserPages([
      "The following browser pages are currently shared with you and can be interacted with using the browser tools:",
      "- [page-1] Search (https://www.bing.com/search?q=astro) (active)",
      "- [page-2] Astro docs (https://docs.astro.build/en/) (not visible)",
    ].join("\n")), [
      { pageId: "page-1", title: "Search", url: "https://www.bing.com/search?q=astro" },
      { pageId: "page-2", title: "Astro docs", url: "https://docs.astro.build/en/" },
    ]);
  });

  test("orders providers and resolves locale using the documented precedence", () => {
    assert.deepStrictEqual(
      getOrderedSearchProviders("Google", "Bing").map((provider) => provider.id),
      ["google", "duckduckgo", "bing", "yahoo"],
    );
    assert.deepStrictEqual(resolveSearchLocale(undefined, undefined, "auto", "es-ES", "en"), {
      language: "es",
      region: "ES",
      tag: "es-ES",
    });
    assert.deepStrictEqual(resolveSearchLocale("pt-BR", "PT", "es-MX", "es-ES", "en"), {
      language: "pt",
      region: "PT",
      tag: "pt-PT",
    });
  });

  test("extracts semantic result blocks and removes search UI, ads, and duplicates", () => {
    const snapshot = [
      "Page ID: page-1",
      "URL: https://www.bing.com/search?q=astro",
      "Snapshot:",
      '- link "Back to Bing search" [ref=ui]:',
      '  - searchbox "Search" [ref=search]: astro',
      '- link "Sponsored Astro course" [ref=ad]:',
      "  - /url: https://ads.example/course",
      "  - text: Sponsored",
      '- link "Astro Documentation" [ref=result-a]:',
      "  - generic: https://docs.astro.build/es/",
      '  - heading "Getting started | Docs" [level=2]',
      "  - paragraph: Official guides and API reference.",
      '- link "Astro Documentation duplicate" [ref=result-b]:',
      "  - /url: https://docs.astro.build/es/?utm_source=bing",
      "  - paragraph: Duplicate.",
      '- link "Astro" [ref=result-c]:',
      "  - /url: https://astro.build/",
      "  - paragraph: The web framework for content-driven websites.",
      '- link "Astro GitHub" [ref=result-d]:',
      "  - /url: https://github.com/withastro/astro",
      "  - paragraph: Source code.",
    ].join("\n");

    const extraction = extractSearchResultsDetailed(snapshot, "https://www.bing.com/search?q=astro", "bing", 6);
    assert.deepStrictEqual(extraction.results.map((result) => result.title), [
      "Astro Documentation",
      "Astro",
      "Astro GitHub",
    ]);
    assert.strictEqual(extraction.results[0]?.url, "https://docs.astro.build/es/");
    assert.strictEqual(extraction.results[0]?.ref, "result-a");
    assert.strictEqual(extraction.urlCoverage, 1);
    assert.ok(extraction.discarded >= 3);
  });

  test("unwraps Google, DuckDuckGo, Yahoo, and Bing redirect URLs", () => {
    const target = "https://example.com/docs?version=10";
    const bingPayload = Buffer.from(target, "utf8").toString("base64url");
    const fixtures: Array<["google" | "duckduckgo" | "yahoo" | "bing", string, string]> = [
      ["google", `https://www.google.com/url?q=${encodeURIComponent(target)}`, "https://www.google.com/search?q=x"],
      ["duckduckgo", `https://duckduckgo.com/l/?uddg=${encodeURIComponent(target)}`, "https://duckduckgo.com/?q=x"],
      ["yahoo", `https://r.search.yahoo.com/_ylt=x/RU=${encodeURIComponent(target)}/RK=2/RS=x`, "https://search.yahoo.com/search?p=x"],
      ["bing", `https://www.bing.com/ck/a?u=a1${bingPayload}&ntb=1`, "https://www.bing.com/search?q=x"],
    ];
    for (const [provider, redirect, searchUrl] of fixtures) {
      assert.strictEqual(normalizeSearchResultUrl(redirect, searchUrl, provider), target);
    }
    assert.strictEqual(
      normalizeSearchResultUrl("https://www.google.com/url?q=https%3A%2F%2Flocalhost%2Fadmin", fixtures[0]![2], "google"),
      undefined,
    );
  });

  test("keeps a standalone raw HTTPS result when semantic links are unavailable", () => {
    const extraction = extractSearchResultsDetailed(
      "Official mirror: https://example.com/releases/latest",
      "https://www.google.com/search?q=release",
      "google",
      6,
    );
    assert.deepStrictEqual(extraction.results.map((result) => result.url), [
      "https://example.com/releases/latest",
    ]);
  });

  test("reuses one page for typing, clicking, and returning to search results", async () => {
    const invocations: Array<{ name: string; input: Record<string, unknown> }> = [];
    let typedQuery = "first";
    const host = createHost(ALL_BROWSER_TOOLS, async (name, input) => {
      invocations.push({ name, input });
      if (name === BROWSER_TOOL_IDS.listPages) {return "No browser pages are open.";}
      if (name === BROWSER_TOOL_IDS.open) {return searchSnapshot(typedQuery);}
      if (name === BROWSER_TOOL_IDS.type) {
        typedQuery = String(input.text);
        return searchSnapshot(typedQuery);
      }
      if (name === BROWSER_TOOL_IDS.click) {return documentSnapshot("https://example.com/docs/1");}
      if (name === BROWSER_TOOL_IDS.navigate && input.type === "back") {return searchSnapshot(typedQuery);}
      return "";
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const search = getTool(tools, "search_web");
    const read = getTool(tools, "read_web");

    const first = JSON.parse(await search.handler({ query: "first" })) as {
      search_id: string;
      results: Array<{ id: string; url: string; ref?: string }>;
    };
    assert.strictEqual(first.results.length, 3);
    assert.strictEqual("ref" in first.results[0]!, false);
    assert.strictEqual("pageId" in first, false);
    assert.strictEqual("searchUrl" in first, false);

    const opened = JSON.parse(await read.handler({
      search_id: first.search_id,
      result_id: first.results[0]!.id,
      focus: "version",
    })) as { document_id: string; content: string };
    assert.ok(opened.document_id.startsWith("document_"));
    assert.match(opened.content, /Version 10/);

    await search.handler({ query: "second" });
    assert.strictEqual(invocations.filter((entry) => entry.name === BROWSER_TOOL_IDS.open).length, 1);
    assert.strictEqual(invocations.filter((entry) => entry.name === BROWSER_TOOL_IDS.click).length, 1);
    assert.strictEqual(invocations.filter((entry) => entry.name === BROWSER_TOOL_IDS.type).length, 1);
    assert.strictEqual(invocations.filter((entry) => entry.name === BROWSER_TOOL_IDS.navigate && entry.input.type === "back").length, 1);
  });

  test("restores and reuses an already shared search page without opening a new one", async () => {
    const invocations: string[] = [];
    const bingSnapshot = searchSnapshot("old").replace(
      /https:\/\/duckduckgo\.com\/\?q=[^\n]+/,
      "https://www.bing.com/search?q=old",
    );
    const host = createHost(ALL_BROWSER_TOOLS, async (name) => {
      invocations.push(name);
      if (name === BROWSER_TOOL_IDS.listPages) {
        return "- [page-1] Search (https://www.bing.com/search?q=old) (active)";
      }
      if (name === BROWSER_TOOL_IDS.read) {return bingSnapshot;}
      if (name === BROWSER_TOOL_IDS.type) {
        return bingSnapshot.replace("old", "new");
      }
      return "";
    });
    const result = JSON.parse(await getTool(
      createIntegratedBrowserTools(new IntegratedBrowserBridge(host)),
      "search_web",
    ).handler({ query: "new" })) as { provider: string; results: unknown[] };

    assert.strictEqual(result.provider, "bing");
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(invocations.includes(BROWSER_TOOL_IDS.open), false);
    assert.deepStrictEqual(invocations, [
      BROWSER_TOOL_IDS.listPages,
      BROWSER_TOOL_IDS.read,
      BROWSER_TOOL_IDS.type,
    ]);
  });

  test("uses URL navigation as a diagnosed compatibility fallback", async () => {
    const compatibleTools = [
      BROWSER_TOOL_IDS.open,
      BROWSER_TOOL_IDS.read,
      BROWSER_TOOL_IDS.navigate,
      BROWSER_TOOL_IDS.click,
    ];
    const invocations: string[] = [];
    const host = createHost(compatibleTools, async (name) => {
      invocations.push(name);
      if (name === BROWSER_TOOL_IDS.open) {return "Page ID: page-1\n\nCAPTCHA: verify you are human";}
      if (name === BROWSER_TOOL_IDS.navigate) {return searchSnapshot("fallback");}
      return "";
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const result = JSON.parse(await getTool(tools, "search_web").handler({ query: "TypeScript docs" })) as {
      provider: string;
      results: unknown[];
    };

    assert.strictEqual(result.provider, "bing");
    assert.strictEqual(result.results.length, 3);
    assert.deepStrictEqual(invocations, [BROWSER_TOOL_IDS.open, BROWSER_TOOL_IDS.navigate]);
  });

  test("recreates a lost optimized page and continues the search", async () => {
    let opens = 0;
    let types = 0;
    const host = createHost(ALL_BROWSER_TOOLS, async (name) => {
      if (name === BROWSER_TOOL_IDS.listPages) {return "";}
      if (name === BROWSER_TOOL_IDS.open) {opens += 1; return searchSnapshot(`open-${opens}`);}
      if (name === BROWSER_TOOL_IDS.type) {types += 1; throw new Error("No browser page found");}
      return "";
    });
    const search = getTool(
      createIntegratedBrowserTools(new IntegratedBrowserBridge(host)),
      "search_web",
    );
    await search.handler({ query: "first" });
    const second = JSON.parse(await search.handler({ query: "second" })) as { results: unknown[] };

    assert.strictEqual(second.results.length, 3);
    assert.strictEqual(types, 1);
    assert.strictEqual(opens, 2);
  });

  test("serves repeated searches and document reads from bounded caches", async () => {
    let opens = 0;
    const host = createHost(ALL_BROWSER_TOOLS, async (name) => {
      if (name === BROWSER_TOOL_IDS.listPages) {return "";}
      if (name === BROWSER_TOOL_IDS.open) {opens += 1; return searchSnapshot("cached");}
      if (name === BROWSER_TOOL_IDS.click) {return documentSnapshot("https://example.com/docs/1");}
      return searchSnapshot("cached");
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const search = getTool(tools, "search_web");
    const first = JSON.parse(await search.handler({ query: "cached", max_results: 3 })) as { search_id: string; results: Array<{ id: string }> };
    const secondRaw = await search.handler({ query: "cached", max_results: 3 });
    const second = JSON.parse(secondRaw) as { cached: boolean };
    assert.strictEqual(second.cached, true);
    assert.strictEqual(opens, 1);
    assert.ok(secondRaw.length <= 8 * 1024);

    const openedRaw = await getTool(tools, "read_web").handler({
      search_id: first.search_id,
      result_id: first.results[0]!.id,
    });
    const opened = JSON.parse(openedRaw) as { document_id: string; next_cursor?: string };
    const readRaw = await getTool(tools, "read_web").handler({
      document_id: opened.document_id,
      query: "Version 10",
    });
    assert.ok(openedRaw.length <= 8 * 1024);
    assert.ok(readRaw.length <= 8 * 1024);
    assert.match(readRaw, /Version 10/);
  });

  test("opens a direct public URL through the read_web URL mode", async () => {
    const invocations: Array<{ name: string; input: Record<string, unknown> }> = [];
    const host = createHost(ALL_BROWSER_TOOLS, async (name, input) => {
      invocations.push({ name, input });
      if (name === BROWSER_TOOL_IDS.open) {
        return documentSnapshot(String(input.url));
      }
      return "";
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const raw = await getTool(tools, "read_web").handler({
      url: "https://example.com/releases",
      focus: "current version",
    });
    const document = JSON.parse(raw) as { document_id: string; url: string; content: string };

    assert.ok(document.document_id.startsWith("document_"));
    assert.strictEqual(document.url, "https://example.com/releases");
    assert.match(document.content, /Version 10/);
    assert.deepStrictEqual(invocations[0], {
      name: BROWSER_TOOL_IDS.open,
      input: { url: "https://example.com/releases", forceNew: false },
    });
  });

  test("requires exactly one valid read_web mode", async () => {
    const read = getTool(
      createIntegratedBrowserTools(new IntegratedBrowserBridge(createHost())),
      "read_web",
    );
    await assert.rejects(read.handler({}), /exactly one source/);
    await assert.rejects(read.handler({
      search_id: "search_1",
      result_id: "result_1",
      url: "https://example.com/",
    }), /exactly one source/);
    await assert.rejects(read.handler({ url: "https://example.com/", query: "version" }), /document_id/);
    await assert.rejects(read.handler({ document_id: "document_1", focus: "version" }), /focus/);
    await assert.rejects(read.handler({
      document_id: "document_1",
      cursor: "1",
      query: "version",
    }), /either cursor or query/);
  });

  test("rejects private URLs and invented or unregistered identifiers", async () => {
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

    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(createHost()));
    await assert.rejects(
      getTool(tools, "read_web").handler({ search_id: "search_invented", result_id: "result_1" }),
      /unknown or expired/,
    );
  });

  test("rejects an unsafe redirect reached from a registered result and returns back", async () => {
    const invocations: Array<{ name: string; input: Record<string, unknown> }> = [];
    const host = createHost(ALL_BROWSER_TOOLS, async (name, input) => {
      invocations.push({ name, input });
      if (name === BROWSER_TOOL_IDS.listPages) {return "";}
      if (name === BROWSER_TOOL_IDS.open) {return searchSnapshot("redirect");}
      if (name === BROWSER_TOOL_IDS.click) {
        return documentSnapshot("https://127.0.0.1/admin");
      }
      if (name === BROWSER_TOOL_IDS.navigate && input.type === "back") {return searchSnapshot("redirect");}
      return "";
    });
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(host));
    const search = JSON.parse(await getTool(tools, "search_web").handler({ query: "redirect" })) as {
      search_id: string;
      results: Array<{ id: string }>;
    };
    await assert.rejects(getTool(tools, "read_web").handler({
      search_id: search.search_id,
      result_id: search.results[0]!.id,
    }), /not allowed/);
    assert.strictEqual(
      invocations.some((entry) => entry.name === BROWSER_TOOL_IDS.navigate && entry.input.type === "back"),
      true,
    );
  });

  test("exposes only the constrained public web tool interface", () => {
    const tools = createIntegratedBrowserTools(new IntegratedBrowserBridge(createHost()));
    assert.deepStrictEqual(tools.map((tool) => tool.definition.function.name), [
      "search_web",
      "read_web",
    ]);
    assert.strictEqual(tools.every((tool) => tool.metadata.approvalOwner === "vscode"), true);
    assert.strictEqual(tools.every((tool) => tool.metadata.requiresConfirmation === false), true);
  });
});

function searchSnapshot(query: string): string {
  return [
    "Page ID: page-1",
    "Page Title: Search",
    `URL: https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    "Snapshot:",
    `- searchbox "Search" [ref=searchbox]: ${query}`,
    "- main:",
    ...[1, 2, 3].flatMap((index) => [
      `  - link "Official result ${index}" [ref=result-${index}]:`,
      `    - /url: https://example.com/docs/${index}`,
      `    - paragraph: Useful organic result ${index} for ${query}.`,
    ]),
  ].join("\n");
}

function documentSnapshot(url: string): string {
  return [
    "Page ID: page-1",
    "Page Title: Official documentation",
    `URL: ${url}`,
    "Snapshot:",
    "- banner:",
    '  - link "Menu" [ref=menu]:',
    "    - /url: https://example.com/",
    "- main:",
    '  - heading "Current release" [level=1]',
    "  - paragraph: Version 10 is the current stable release.",
    "  - code: npm install example@10",
    "- contentinfo:",
    "  - text: Privacy and cookies",
  ].join("\n");
}

function getTool(tools: ReturnType<typeof createIntegratedBrowserTools>, name: string) {
  const tool = tools.find((candidate) => candidate.definition.function.name === name);
  assert.ok(tool, `Missing tool ${name}`);
  return tool;
}

function createHost(
  toolNames: readonly string[] = ALL_BROWSER_TOOLS,
  invoke: BrowserToolHost["invokeTool"] = async () => "",
): BrowserToolHost {
  return {
    getToolNames: () => toolNames,
    invokeTool: invoke,
    getSearchEnginePreference: () => "auto",
    getNativeSearchEnginePreference: () => undefined,
    getConfiguredLocale: () => "auto",
    getSystemLocale: () => "es-ES",
    getVsCodeLanguage: () => "en",
    getChatToolsSetting: () => true,
  };
}
