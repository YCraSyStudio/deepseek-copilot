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
    sha256: "806f5bc9d208fc49bcbcd90268bc52c24ab9b36353b1f1d010542b3c2edce282",
    size: 57_378_264,
  }),
  "linux-arm64": Object.freeze({
    name: "searxng-runtime-linux-arm64",
    sha256: "2af708901fe7fa12164e5062365e52398232b59474d26ef40583b6ac7970f7a8",
    size: 56_067_192,
  }),
  "win32-x64": Object.freeze({
    name: "searxng-runtime-win32-x64.exe",
    sha256: "3a7141efae2bfa49b309ec5cc22275f760f27ae764eaabca67ade546c838c267",
    size: 39_818_500,
  }),
  "darwin-x64": Object.freeze({
    name: "searxng-runtime-darwin-x64",
    sha256: "e3b5e28855f55641c268ef97e40ce31f8be0c6dab82ebdca472f857ec0e10bb3",
    size: 40_334_192,
  }),
  "darwin-arm64": Object.freeze({
    name: "searxng-runtime-darwin-arm64",
    sha256: "5b32f32acad3a9956266808d22e4970c1dc3bd459325a14e43408dacaa50a216",
    size: 39_463_696,
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
