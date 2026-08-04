import { existsSync } from "node:fs";
import { resolve } from "node:path";
import yauzl from "yauzl";

const vsixPath = resolve(process.argv[2] ?? "");
if (!existsSync(vsixPath)) {
  throw new Error(`VSIX not found: ${vsixPath}`);
}

const entries = await listEntries(vsixPath);
const required = [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/dist/webview/index.html",
  "extension/readme.md",
];
for (const file of required) {
  if (!entries.has(file)) {
    throw new Error(`Required VSIX entry is missing: ${file}`);
  }
}

const allowedExact = new Set([
  "[Content_Types].xml",
  "extension.vsixmanifest",
  "extension/LICENSE.txt",
  "extension/changelog.md",
  "extension/package.json",
  "extension/readme.md",
]);
const unexpected = [...entries].filter((file) =>
  !allowedExact.has(file) &&
  !file.startsWith("extension/dist/") &&
  !file.startsWith("extension/src/assets/"),
);
if (unexpected.length > 0) {
  throw new Error(`Unexpected files outside the VSIX allowlist:\n${unexpected.join("\n")}`);
}

console.log(`Verified ${entries.size} intentional VSIX entries.`);

function listEntries(file) {
  return new Promise((resolveList, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error("Unable to open VSIX"));
        return;
      }
      const names = new Set();
      zip.on("entry", (entry) => {
        if (!entry.fileName.endsWith("/")) {
          names.add(entry.fileName);
        }
        zip.readEntry();
      });
      zip.once("error", reject);
      zip.once("end", () => resolveList(names));
      zip.readEntry();
    });
  });
}
