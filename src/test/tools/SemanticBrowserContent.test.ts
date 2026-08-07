import * as assert from "node:assert";
import {
  extractSemanticDocument,
  selectDocumentContent,
} from "@/vscodeApi/tools/browser/SemanticContent";

suite("semantic browser content", () => {
  test("keeps Astro headings, prose, lists, code, and useful links while removing chrome", () => {
    const document = extractSemanticDocument([
      "Page Title: Why Astro? | Docs",
      "URL: https://docs.astro.build/es/concepts/why-astro/",
      "Snapshot:",
      "- banner:",
      '  - button "Buscar" [ref=search]',
      "  - navigation:",
      '    - option "English"',
      "- main:",
      '  - heading "¿Por qué Astro?" [level=1]',
      "  - paragraph: Astro es el framework web para sitios orientados al contenido.",
      "  - list:",
      "    - listitem: Servidor primero",
      "    - listitem: Rápido por defecto",
      "  - code: npm create astro@latest",
      '  - link "Getting started" [ref=docs]:',
      "    - /url: /es/getting-started/",
      "- contentinfo:",
      "  - text: Privacy & Cookies",
    ].join("\n"), "https://docs.astro.build/es/concepts/why-astro/");

    assert.match(document.content, /# ¿Por qué Astro\?/);
    assert.match(document.content, /Servidor primero/);
    assert.match(document.content, /npm create astro@latest/);
    assert.doesNotMatch(document.content, /Buscar|English|Privacy & Cookies/);
    assert.deepStrictEqual(document.links, [{
      title: "Getting started",
      url: "https://docs.astro.build/es/getting-started/",
    }]);
  });

  test("keeps Microsoft version tables and version-like button values but removes tooltips and footer", () => {
    const document = extractSemanticDocument([
      "Page Title: Download .NET",
      "URL: https://dotnet.microsoft.com/en-us/download/dotnet/10.0",
      "Snapshot:",
      "- main:",
      '  - heading ".NET 10 downloads" [level=1]',
      "  - table:",
      "    - row:",
      "      - columnheader: Component",
      "      - columnheader: Version",
      "    - row:",
      "      - cell: SDK",
      "      - cell: 10.0.302",
      '  - button "10.0.10" [ref=release]:',
      "    - tooltip: This release contains security fixes.",
      "- contentinfo:",
      "  - text: Microsoft corporate links",
    ].join("\n"), "https://dotnet.microsoft.com/en-us/download/dotnet/10.0");

    assert.match(document.content, /\| Component \| Version \|/);
    assert.match(document.content, /\| SDK \| 10\.0\.302 \|/);
    assert.match(document.content, /10\.0\.10/);
    assert.doesNotMatch(document.content, /security fixes|corporate links/);
  });

  test("supports bounded cursor reads and focused passage selection", () => {
    const document = extractSemanticDocument([
      "Page Title: Releases",
      "URL: https://example.com/releases",
      "Snapshot:",
      "- main:",
      "  - paragraph: Alpha information.",
      "  - paragraph: Stable Version 10 release details.",
      "  - paragraph: Preview Version 11 details.",
    ].join("\n"), "https://example.com/releases");
    const focused = selectDocumentContent(document, 0, "Version 10", 200);
    const first = selectDocumentContent(document, 0, undefined, 20);

    assert.match(focused.content, /Version 10/);
    assert.doesNotMatch(focused.content, /Alpha/);
    assert.strictEqual(first.content.length, 20);
    assert.ok(first.nextCursor);
  });
});
