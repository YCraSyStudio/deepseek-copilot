import * as assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";

const sourceRoot = resolve(process.cwd(), "src");
const allowedDependencies: Record<string, ReadonlySet<string>> = {
  adapters: new Set(["adapters", "shared"]),
  core: new Set(["adapters", "core", "shared"]),
  deepseekApi: new Set(["adapters", "core", "deepseekApi", "shared"]),
  ui: new Set(["adapters", "assets", "shared", "ui"]),
};

suite("architecture boundaries", () => {
  test("does not introduce inverse dependencies between layers", () => {
    const violations: string[] = [];
    for (const file of collectSourceFiles(sourceRoot)) {
      const owner = getLayer(file);
      const allowed = allowedDependencies[owner];
      if (!allowed) {
        continue;
      }
      for (const specifier of getImportSpecifiers(readFileSync(file, "utf8"))) {
        const importedFile = resolveInternalImport(file, specifier);
        if (!importedFile) {
          continue;
        }
        const dependency = getLayer(importedFile);
        if (dependency && !allowed.has(dependency)) {
          violations.push(
            `${relative(sourceRoot, file)} -> ${specifier} (${owner} -> ${dependency})`,
          );
        }
      }
    }
    assert.deepStrictEqual(violations, []);
  });
});

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "test" ? [] : collectSourceFiles(path);
    }
    return entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))
      ? [path]
      : [];
  });
}

function getImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveInternalImport(ownerFile: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) {
    return resolve(sourceRoot, specifier.slice(2));
  }
  if (specifier.startsWith("@webview/")) {
    return resolve(sourceRoot, "ui", specifier.slice("@webview/".length));
  }
  if (specifier.startsWith(".")) {
    return resolve(dirname(ownerFile), specifier);
  }
  return undefined;
}

function getLayer(file: string): string {
  return relative(sourceRoot, file).split(/[\\/]/)[0];
}
