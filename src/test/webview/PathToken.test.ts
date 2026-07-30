import * as assert from "assert";
import { getPathToken } from "@/ui/components/chatView/fileSelector/PathToken";

suite("workspace path autocomplete token", () => {
  test("accepts only ./ tokens at the cursor", () => {
    assert.deepStrictEqual(getPathToken("./frontend/src", 14), {
      query: "./frontend/src",
      start: 0,
      end: 14,
    });
    assert.strictEqual(getPathToken("../outside", 10), null);
    assert.strictEqual(getPathToken("open ../outside", 15), null);
    assert.strictEqual(getPathToken("src/file.ts", 11), null);
  });
});
