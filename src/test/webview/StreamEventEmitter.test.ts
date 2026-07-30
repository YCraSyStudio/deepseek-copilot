import * as assert from "assert";
import { StreamEventEmitter } from "@/vscodeApi/webviews/handlers/chat/StreamEventEmitter";

suite("StreamEventEmitter", () => {
  test("creates ordered native events across reasoning, tools and content", () => {
    const posted: unknown[] = [];
    const emitter = new StreamEventEmitter({
      webview: {
        postMessage: (message: unknown) => {
          posted.push(message);
          return Promise.resolve(true);
        },
      },
    } as never);

    emitter.reasoning("First ");
    emitter.reasoning("thought");
    emitter.toolGroup(1, ["call-1"]);
    emitter.reasoning("Second thought");
    emitter.chunk("Final answer");

    const timeline = emitter.getTimeline();
    assert.deepStrictEqual(
      timeline.map((event) => event.type),
      ["reasoning", "tool-group", "reasoning", "content"],
    );
    assert.strictEqual(timeline[0].type === "reasoning" && timeline[0].content, "First thought");
    assert.strictEqual(timeline[1].type === "tool-group" && timeline[1].round, 1);
    assert.strictEqual(timeline[2].type === "reasoning" && timeline[2].content, "Second thought");
    assert.strictEqual(timeline[3].type === "content" && timeline[3].content, "Final answer");
    assert.deepStrictEqual(
      posted.map((message) => (message as { type: string }).type),
      [
        "streamTimelineDelta",
        "streamTimelineDelta",
        "streamTimelineToolGroup",
        "streamTimelineDelta",
        "streamTimelineDelta",
      ],
    );
  });
});
