import * as assert from "node:assert";
import {
  PINNED_SEARXNG_RUNTIME_ASSETS,
  SEARXNG_RUNTIME_COMMIT,
  SEARXNG_RUNTIME_VERSION,
  expectedSearxngRuntimeAssetName,
  parseSearxngRuntimeManifest,
  resolvePinnedSearxngRuntimeAsset,
  resolveSearxngRuntimeAsset,
} from "@/infrastructure/browser/SearxngRuntimeManifest";

suite("SearxngRuntimeManifest", () => {
  test("ships exact production hashes inside the extension", () => {
    assert.deepStrictEqual(PINNED_SEARXNG_RUNTIME_ASSETS, {
      "linux-x64": {
        name: "searxng-runtime-linux-x64",
        sha256: "098d1240125ca03287f8d11754adbca1dd87097da43eceb486614b8905f22e34",
        size: 57_385_216,
      },
      "linux-arm64": {
        name: "searxng-runtime-linux-arm64",
        sha256: "350994beafb8ca48c5454f196aa9623031ef5cbebfc735992fca0d80e5f158d7",
        size: 56_074_520,
      },
      "win32-x64": {
        name: "searxng-runtime-win32-x64.exe",
        sha256: "76bf2b580a21f3c8d6b9db9baad3745f027f969ff6f2acc798747e3cfda36035",
        size: 39_824_137,
      },
      "darwin-x64": {
        name: "searxng-runtime-darwin-x64",
        sha256: "0367108ae89f5f575e29cbdd2ead1ebc46fa02a894525d116cd539fefb45b2f8",
        size: 40_355_664,
      },
      "darwin-arm64": {
        name: "searxng-runtime-darwin-arm64",
        sha256: "8f82394c04f2d541c74fdbbf7f480f8b6fa157757b288750620bad9f07dc3187",
        size: 39_470_304,
      },
    });
  });

  test("accepts release metadata only when it exactly matches the VSIX trust anchor", () => {
    const pinned = resolvePinnedSearxngRuntimeAsset("linux-x64");
    const manifest = parseSearxngRuntimeManifest({
      runtime_version: SEARXNG_RUNTIME_VERSION,
      searxng_commit: SEARXNG_RUNTIME_COMMIT,
      assets: { "linux-x64": pinned },
    });
    assert.deepStrictEqual(resolveSearxngRuntimeAsset(manifest, "linux-x64"), pinned);
  });

  test("rejects release metadata whose checksum differs from the VSIX trust anchor", () => {
    const pinned = resolvePinnedSearxngRuntimeAsset("linux-x64");
    const manifest = parseSearxngRuntimeManifest({
      runtime_version: SEARXNG_RUNTIME_VERSION,
      searxng_commit: SEARXNG_RUNTIME_COMMIT,
      assets: {
        "linux-x64": { ...pinned, sha256: "a".repeat(64) },
      },
    });
    assert.throws(
      () => resolveSearxngRuntimeAsset(manifest, "linux-x64"),
      /does not match the pinned linux-x64 asset/,
    );
  });

  test("rejects an unexpected runtime version", () => {
    assert.throws(() => parseSearxngRuntimeManifest({
      runtime_version: "other",
      searxng_commit: SEARXNG_RUNTIME_COMMIT,
      assets: {},
    }), /Unexpected SearXNG runtime version/);
  });

  test("rejects a mismatched asset filename", () => {
    assert.throws(() => parseSearxngRuntimeManifest({
      runtime_version: SEARXNG_RUNTIME_VERSION,
      searxng_commit: SEARXNG_RUNTIME_COMMIT,
      assets: {
        "win32-x64": { name: "wrong.exe", sha256: "b".repeat(64), size: 2048 },
      },
    }), /Unexpected SearXNG runtime asset name/);
  });

  test("fails closed when the current platform has no pinned runtime", () => {
    assert.equal(expectedSearxngRuntimeAssetName("win32-arm64"), "searxng-runtime-win32-arm64.exe");
    assert.throws(
      () => resolvePinnedSearxngRuntimeAsset("win32-arm64"),
      /No pinned SearXNG runtime is published/,
    );
  });
});
