import * as assert from "assert";
import type { ToolCall } from "@/adapters";
import { readFileDefinition, readFileHandler, readFileMetadata } from "@/core/tools/definitions/ReadFile";
import { ToolRegistry } from "@/core/tools/ToolRegistry";

suite("tool registry validation", () => {
  test("rejects unknown tools", () => {
    const registry = createRegistry();
    const result = registry.validate(createToolCall("missing_tool", {}));

    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? "", /Unknown tool/);
  });

  test("rejects malformed JSON arguments", () => {
    const registry = createRegistry();
    const result = registry.validate({
      function: { name: "read_file", arguments: "{" },
    });

    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? "", /Invalid JSON/);
  });

  test("rejects missing required properties", () => {
    const registry = createRegistry();
    const result = registry.validate(createToolCall("read_file", {}));

    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? "", /missing required property 'path'/);
  });

  test("rejects unknown properties for strict schemas", () => {
    const registry = createRegistry();
    const result = registry.validate(createToolCall("read_file", { path: "README.md", unexpected: true }));

    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? "", /unknown property 'unexpected'/);
  });

  test("rejects primitive type mismatches", () => {
    const registry = createRegistry();
    const result = registry.validate(createToolCall("read_file", { path: 1 }));

    assert.strictEqual(result.valid, false);
    assert.match(result.error ?? "", /property 'path' must be string/);
  });
});

function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({ definition: readFileDefinition, handler: readFileHandler, metadata: readFileMetadata });
  return registry;
}

function createToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: "call_1",
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}
