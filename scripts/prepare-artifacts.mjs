import { mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const artifactsDirectory = "artifacts";

await mkdir(artifactsDirectory, { recursive: true });
const stalePackages = (await readdir(artifactsDirectory))
  .filter((name) => name === "yrs-dpsk-copilot.vsix" || /^yrs-dpsk-copilot-.+\.vsix$/.test(name));
await Promise.all(stalePackages.map((name) => unlink(join(artifactsDirectory, name))));
