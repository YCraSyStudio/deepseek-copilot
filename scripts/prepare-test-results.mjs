import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });
