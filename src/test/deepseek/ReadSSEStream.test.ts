import * as assert from "assert";
import { readSSEStream } from "@/deepseekApi/streaming/ReadSSEStream";

suite("SSE reader", () => {
  test("supports split chunks, comments, data without spaces and multiline events", async () => {
    const encoder = new TextEncoder();
    const values: unknown[] = [];
    let doneCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": keepalive\r\ndata:{\"value\":"));
        controller.enqueue(encoder.encode("\r\ndata:42}\r\n\r\ndata: [DONE]\r\n\r\n"));
        controller.close();
      },
    });
    await readSSEStream({ reader: stream.getReader(), onChunk: (value) => values.push(value), onDone: () => doneCount++ });
    assert.deepStrictEqual(values, [{ value: 42 }]);
    assert.strictEqual(doneCount, 1);
  });

  test("reports malformed JSON instead of silently dropping it", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("data: {bad}\n\n")); controller.close(); } });
    await assert.rejects(readSSEStream({ reader: stream.getReader(), onChunk: () => undefined, onDone: () => undefined }), /Malformed SSE JSON/);
  });
});
