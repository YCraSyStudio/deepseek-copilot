import * as assert from "node:assert";
import { shouldApplyConfigRevision } from "@/ui/config/ConfigRevision";

suite("configuration acknowledgement ordering", () => {
  test("accepts the current or a newer authoritative revision", () => {
    assert.strictEqual(shouldApplyConfigRevision(4, 4), true);
    assert.strictEqual(shouldApplyConfigRevision(4, 5), true);
  });

  test("ignores an acknowledgement delivered after a newer revision", () => {
    assert.strictEqual(shouldApplyConfigRevision(5, 4), false);
    assert.strictEqual(shouldApplyConfigRevision(5, Number.NaN), false);
  });
});
