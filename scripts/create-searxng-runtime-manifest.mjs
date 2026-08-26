import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "runtime-dist");
const runtimeVersion = process.env.SEARXNG_RUNTIME_VERSION;
const searxngCommit = process.env.SEARXNG_COMMIT;
if (!runtimeVersion || !searxngCommit) {
  throw new Error("SEARXNG_RUNTIME_VERSION and SEARXNG_COMMIT are required");
}

const files = await readdir(directory);
const assets = {};
for (const name of files.sort()) {
  const match = /^searxng-runtime-(linux|win32|darwin)-(x64|arm64)(\.exe)?$/.exec(name);
  if (!match) {continue;}
  const platformKey = `${match[1]}-${match[2]}`;
  const filePath = join(directory, name);
  const bytes = await readFile(filePath);
  assets[platformKey] = {
    name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: (await stat(filePath)).size,
  };
}

const required = String(process.env.REQUIRED_RUNTIME_KEYS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
for (const key of required) {
  if (!assets[key]) {throw new Error(`Required SearXNG runtime asset is missing: ${key}`);}
}

const manifest = {
  runtime_version: runtimeVersion,
  searxng_commit: searxngCommit,
  assets,
};
await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
