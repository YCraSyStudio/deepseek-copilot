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
        sha256: "a424e312f7c6be591819ae68bb7b3178e5f6edaf47c992488a36524e0645f788",
        size: 57_384_640,
      },
      "linux-arm64": {
        name: "searxng-runtime-linux-arm64",
        sha256: "c29609495aa36ed5b0ba820217b7e7a92f7bbb68980242588b1e067343fc2f0c",
        size: 56_074_744,
      },
      "win32-x64": {
        name: "searxng-runtime-win32-x64.exe",
        sha256: "a40217fb31552d9ee182cabf321e816e4fc5c5915febbead2cdac1de64fb6db4",
        size: 39_825_631,
      },
      "darwin-x64": {
        name: "searxng-runtime-darwin-x64",
        sha256: "5b30cc7608504df4fe043b4a9bb9861f34ef7c06103f3620fe075f8d951753f4",
        size: 40_356_496,
      },
      "darwin-arm64": {
        name: "searxng-runtime-darwin-arm64",
        sha256: "c63b441730024bf371f2e1f92495eb008eb6fb46fdbb7fb0cf102e854ff6f911",
        size: 39_471_456,
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
