import * as assert from "node:assert";
import {
  containsSerializedToolProtocol,
  SerializedToolProtocolStreamGuard,
} from "@/application/chat/toolCall/SerializedToolProtocol";

suite("serialized tool protocol guard", () => {
  test("recognizes DeepSeek DSML with full-width protocol separators", () => {
    assert.strictEqual(containsSerializedToolProtocol(
      '<｜DSML｜tool_calls><｜DSML｜invoke name="read_file">',
    ), true);
    assert.strictEqual(containsSerializedToolProtocol("DSML is mentioned in ordinary prose"), false);
  });

  test("suppresses a DSML marker split across stream chunks", () => {
    const guard = new SerializedToolProtocolStreamGuard();
    let visible = "";
    visible += guard.push("Here is a safe prefix. <｜DS");
    visible += guard.push("ML｜tool_calls><｜DSML｜invoke");
    visible += guard.push(' name="read_file">');
    visible += guard.finish();

    assert.strictEqual(visible, "Here is a safe prefix. ");
    assert.strictEqual(guard.hasDetectedProtocol, true);
  });

  test("flushes ordinary streamed content unchanged", () => {
    const guard = new SerializedToolProtocolStreamGuard();
    const content = "A complete answer without internal protocol markup.";
    const visible = guard.push(content) + guard.finish();

    assert.strictEqual(visible, content);
    assert.strictEqual(guard.hasDetectedProtocol, false);
  });
});
