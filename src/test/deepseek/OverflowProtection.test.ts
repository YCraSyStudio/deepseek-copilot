import * as assert from "assert";
import { readBoundedJson } from "@/infrastructure/deepseek/client/BoundedResponseJson";
import { fitToolResultForModel } from "@/application/chat/toolCall/ToolResultBudget";
import { boundUtf8HeadTail } from "@/shared/utils/BoundedText";

suite("overflow protection", () => {
  test("bounds tool results by UTF-8 bytes while preserving head and tail", () => {
    const value = `HEAD-${"界".repeat(100)}-TAIL`;
    const bounded = fitToolResultForModel(value, 96);

    assert.ok(Buffer.byteLength(bounded, "utf8") <= 96);
    assert.ok(bounded.startsWith("HEAD-"));
    assert.ok(bounded.endsWith("-TAIL"));
    assert.match(bounded, /middle omitted/);
  });

  test("bounds generic continuity text by UTF-8 bytes", () => {
    const bounded = boundUtf8HeadTail(`start-${"😀".repeat(100)}-end`, 96);

    assert.strictEqual(bounded.truncated, true);
    assert.ok(Buffer.byteLength(bounded.text, "utf8") <= 96);
    assert.ok(bounded.text.startsWith("start-"));
    assert.ok(bounded.text.endsWith("-end"));
    assert.ok(!bounded.text.includes("�"));
    assert.strictEqual(hasUnpairedSurrogate(bounded.text), false);
  });

  test("honors byte limits smaller than the omission marker", () => {
    const bounded = boundUtf8HeadTail("😀😀😀", 5);

    assert.ok(Buffer.byteLength(bounded.text, "utf8") <= 5);
    assert.strictEqual(hasUnpairedSurrogate(bounded.text), false);
  });

  test("rejects declared and streamed JSON bodies above their limits", async () => {
    await assert.rejects(
      readBoundedJson(new Response("{}", { headers: { "content-length": "100" } }), 16),
      /exceeded 16 bytes/,
    );

    const encoder = new TextEncoder();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode(`${"x".repeat(64)}"}`));
        controller.close();
      },
    }));
    await assert.rejects(readBoundedJson(response, 32), /exceeded 32 bytes/);
  });

  test("parses a response that stays inside the byte budget", async () => {
    assert.deepStrictEqual(await readBoundedJson(new Response('{"ok":true}'), 32), { ok: true });
  });
});

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      if (index + 1 >= value.length) {return true;}
      const next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) {return true;}
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}
