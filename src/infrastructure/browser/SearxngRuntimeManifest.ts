export const SEARXNG_RUNTIME_VERSION = "2026.08.22-9fea41204-v2";
export const SEARXNG_RUNTIME_COMMIT = "9fea41204fdfa7a5cfa15b0ebd12904c520478ce";
export const SEARXNG_RUNTIME_RELEASE_TAG = `searxng-runtime-${SEARXNG_RUNTIME_VERSION}`;
export const SEARXNG_RUNTIME_RELEASE_BASE_URL = `https://github.com/YCraSyStudio/deepseek-copilot/releases/download/${SEARXNG_RUNTIME_RELEASE_TAG}`;
export const MAX_SEARXNG_RUNTIME_BYTES = 512 * 1024 * 1024;

export type SearxngRuntimePlatformKey =
  | "linux-x64"
  | "linux-arm64"
  | "win32-x64"
  | "win32-arm64"
  | "darwin-x64"
  | "darwin-arm64";

export interface SearxngRuntimeAsset {
  readonly name: string;
  readonly sha256: string;
  readonly size: number;
}

export interface SearxngRuntimeManifest {
  readonly runtime_version: string;
  readonly searxng_commit: string;
  readonly assets: Partial<Record<SearxngRuntimePlatformKey, SearxngRuntimeAsset>>;
}

/**
 * Trust anchor shipped inside the VSIX. Runtime downloads are accepted only when
 * they match these exact sizes and SHA-256 digests; release metadata is never a
 * source of trust for executable bytes.
 */
export const PINNED_SEARXNG_RUNTIME_ASSETS: Readonly<Partial<Record<SearxngRuntimePlatformKey, SearxngRuntimeAsset>>> = Object.freeze({
  "linux-x64": Object.freeze({
    name: "searxng-runtime-linux-x64",
    sha256: "098d1240125ca03287f8d11754adbca1dd87097da43eceb486614b8905f22e34",
    size: 57_385_216,
  }),
  "linux-arm64": Object.freeze({
    name: "searxng-runtime-linux-arm64",
    sha256: "350994beafb8ca48c5454f196aa9623031ef5cbebfc735992fca0d80e5f158d7",
    size: 56_074_520,
  }),
  "win32-x64": Object.freeze({
    name: "searxng-runtime-win32-x64.exe",
    sha256: "76bf2b580a21f3c8d6b9db9baad3745f027f969ff6f2acc798747e3cfda36035",
    size: 39_824_137,
  }),
  "darwin-x64": Object.freeze({
    name: "searxng-runtime-darwin-x64",
    sha256: "0367108ae89f5f575e29cbdd2ead1ebc46fa02a894525d116cd539fefb45b2f8",
    size: 40_355_664,
  }),
  "darwin-arm64": Object.freeze({
    name: "searxng-runtime-darwin-arm64",
    sha256: "8f82394c04f2d541c74fdbbf7f480f8b6fa157757b288750620bad9f07dc3187",
    size: 39_470_304,
  }),
});

const PLATFORM_KEYS = new Set<SearxngRuntimePlatformKey>([
  "linux-x64",
  "linux-arm64",
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
]);

export function expectedSearxngRuntimeAssetName(platformKey: SearxngRuntimePlatformKey): string {
  return `searxng-runtime-${platformKey}${platformKey.startsWith("win32-") ? ".exe" : ""}`;
}

export function resolvePinnedSearxngRuntimeAsset(platformKey: SearxngRuntimePlatformKey): SearxngRuntimeAsset {
  const asset = PINNED_SEARXNG_RUNTIME_ASSETS[platformKey];
  if (!asset) {
    throw new Error(`No pinned SearXNG runtime is published for ${platformKey}`);
  }
  return asset;
}

export function parseSearxngRuntimeManifest(value: unknown): SearxngRuntimeManifest {
  if (!isRecord(value)) {throw new Error("SearXNG runtime manifest must be an object");}
  if (value.runtime_version !== SEARXNG_RUNTIME_VERSION) {
    throw new Error(`Unexpected SearXNG runtime version: ${String(value.runtime_version ?? "missing")}`);
  }
  if (value.searxng_commit !== SEARXNG_RUNTIME_COMMIT) {
    throw new Error(`Unexpected SearXNG source revision: ${String(value.searxng_commit ?? "missing")}`);
  }
  if (!isRecord(value.assets)) {throw new Error("SearXNG runtime manifest is missing assets");}

  const assets: Partial<Record<SearxngRuntimePlatformKey, SearxngRuntimeAsset>> = {};
  for (const [key, rawAsset] of Object.entries(value.assets)) {
    if (!PLATFORM_KEYS.has(key as SearxngRuntimePlatformKey)) {
      throw new Error(`Unsupported SearXNG runtime platform in manifest: ${key}`);
    }
    const platformKey = key as SearxngRuntimePlatformKey;
    assets[platformKey] = parseAsset(platformKey, rawAsset);
  }
  return {
    runtime_version: SEARXNG_RUNTIME_VERSION,
    searxng_commit: SEARXNG_RUNTIME_COMMIT,
    assets,
  };
}

/**
 * Remote manifests remain useful release metadata, but any consumer must prove
 * that their entry exactly matches the trust anchor embedded in the extension.
 */
export function resolveSearxngRuntimeAsset(
  manifest: SearxngRuntimeManifest,
  platformKey: SearxngRuntimePlatformKey,
): SearxngRuntimeAsset {
  const asset = manifest.assets[platformKey];
  if (!asset) {
    throw new Error(`No SearXNG runtime is published for ${platformKey}`);
  }
  const pinned = resolvePinnedSearxngRuntimeAsset(platformKey);
  if (asset.name !== pinned.name || asset.sha256 !== pinned.sha256 || asset.size !== pinned.size) {
    throw new Error(`Published SearXNG runtime metadata does not match the pinned ${platformKey} asset`);
  }
  return pinned;
}

function parseAsset(platformKey: SearxngRuntimePlatformKey, value: unknown): SearxngRuntimeAsset {
  if (!isRecord(value)) {throw new Error(`Invalid SearXNG runtime asset for ${platformKey}`);}
  const expectedName = expectedSearxngRuntimeAssetName(platformKey);
  if (value.name !== expectedName) {
    throw new Error(`Unexpected SearXNG runtime asset name for ${platformKey}: ${String(value.name ?? "missing")}`);
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256)) {
    throw new Error(`Invalid SearXNG runtime checksum for ${platformKey}`);
  }
  if (!Number.isSafeInteger(value.size) || Number(value.size) < 1 || Number(value.size) > MAX_SEARXNG_RUNTIME_BYTES) {
    throw new Error(`Invalid SearXNG runtime size for ${platformKey}`);
  }
  return { name: expectedName, sha256: value.sha256.toLowerCase(), size: Number(value.size) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
