import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(resolve(projectRoot, "src/infrastructure/browser/SearxngRuntimeManifest.ts"), "utf8");
const builder = await readFile(resolve(projectRoot, "scripts/build-searxng-runtime.py"), "utf8");
const workflow = await readFile(resolve(projectRoot, ".github/workflows/searxng-runtime.yml"), "utf8");

const runtimeVersion = requiredMatch(source, /SEARXNG_RUNTIME_VERSION = "([^"]+)"/, "extension runtime version");
const searxngCommit = requiredMatch(source, /SEARXNG_RUNTIME_COMMIT = "([a-f0-9]{40})"/, "extension SearXNG commit");
const releaseTag = `searxng-runtime-${runtimeVersion}`;
const pinnedAssets = parsePinnedAssets(source);

assertEqual(requiredMatch(builder, /RUNTIME_VERSION = "([^"]+)"/, "builder runtime version"), runtimeVersion, "builder runtime version");
assertEqual(requiredMatch(builder, /EXPECTED_COMMIT = "([a-f0-9]{40})"/, "builder SearXNG commit"), searxngCommit, "builder SearXNG commit");
assertEqual(requiredMatch(workflow, /SEARXNG_RUNTIME_VERSION:\s*([^\s]+)/, "workflow runtime version"), runtimeVersion, "workflow runtime version");
assertEqual(requiredMatch(workflow, /SEARXNG_COMMIT:\s*([a-f0-9]{40})/, "workflow SearXNG commit"), searxngCommit, "workflow SearXNG commit");
assertEqual(requiredMatch(workflow, /SEARXNG_RUNTIME_TAG:\s*([^\s]+)/, "workflow runtime tag"), releaseTag, "workflow runtime tag");

const requiredKeys = requiredMatch(workflow, /REQUIRED_RUNTIME_KEYS:\s*([^\r\n]+)/, "workflow required runtime keys")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .sort();
const pinnedKeys = Object.keys(pinnedAssets).sort();
assertEqual(JSON.stringify(requiredKeys), JSON.stringify(pinnedKeys), "workflow required runtime keys");

const manifestFlag = process.argv.indexOf("--manifest");
if (manifestFlag >= 0) {
  const manifestArgument = process.argv[manifestFlag + 1];
  if (!manifestArgument) {throw new Error("--manifest requires a path");}
  const manifest = JSON.parse(await readFile(resolve(manifestArgument), "utf8"));
  assertEqual(manifest.runtime_version, runtimeVersion, "generated manifest runtime version");
  assertEqual(manifest.searxng_commit, searxngCommit, "generated manifest SearXNG commit");
  assertEqual(JSON.stringify(Object.keys(manifest.assets ?? {}).sort()), JSON.stringify(pinnedKeys), "generated manifest asset keys");
  for (const [platformKey, pinned] of Object.entries(pinnedAssets)) {
    const generated = manifest.assets?.[platformKey];
    if (
      generated?.name !== pinned.name ||
      generated?.sha256 !== pinned.sha256 ||
      generated?.size !== pinned.size
    ) {
      throw new Error(`Generated ${platformKey} runtime does not match the extension trust anchor`);
    }
  }
}

console.log(`Verified pinned SearXNG runtime configuration: ${releaseTag} (${pinnedKeys.length} assets).`);

function requiredMatch(text, pattern, label) {
  const value = pattern.exec(text)?.[1];
  if (!value) {throw new Error(`Unable to read ${label}`);}
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);}
}

function parsePinnedAssets(text) {
  const assets = {};
  const pattern = /"((?:linux|win32|darwin)-(?:x64|arm64))": Object\.freeze\(\{\s*name: "([^"]+)",\s*sha256: "([a-f0-9]{64})",\s*size: ([\d_]+),\s*\}\)/g;
  for (const match of text.matchAll(pattern)) {
    assets[match[1]] = {name: match[2], sha256: match[3], size: Number(match[4].replaceAll("_", ""))};
  }
  if (Object.keys(assets).length === 0) {throw new Error("Unable to read pinned SearXNG runtime assets");}
  return assets;
}
