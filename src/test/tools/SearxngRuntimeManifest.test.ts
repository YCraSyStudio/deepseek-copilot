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
        sha256: "806f5bc9d208fc49bcbcd90268bc52c24ab9b36353b1f1d010542b3c2edce282",
        size: 57_378_264,
      },
      "linux-arm64": {
        name: "searxng-runtime-linux-arm64",
        sha256: "2af708901fe7fa12164e5062365e52398232b59474d26ef40583b6ac7970f7a8",
        size: 56_067_192,
      },
      "win32-x64": {
        name: "searxng-runtime-win32-x64.exe",
        sha256: "3a7141efae2bfa49b309ec5cc22275f760f27ae764eaabca67ade546c838c267",
        size: 39_818_500,
      },
      "darwin-x64": {
        name: "searxng-runtime-darwin-x64",
        sha256: "e3b5e28855f55641c268ef97e40ce31f8be0c6dab82ebdca472f857ec0e10bb3",
        size: 40_334_192,
      },
      "darwin-arm64": {
        name: "searxng-runtime-darwin-arm64",
        sha256: "5b32f32acad3a9956266808d22e4970c1dc3bd459325a14e43408dacaa50a216",
        size: 39_463_696,
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
