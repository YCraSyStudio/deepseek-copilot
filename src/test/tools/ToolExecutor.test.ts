import * as assert from "assert";
import type { ToolCall, ToolDefinition } from "@/adapters";
import { ToolExecutor } from "@/core/tools/ToolExecutor";
import { ToolRegistry } from "@/core/tools/ToolRegistry";

suite("tool executor result classification", () => {
  test("marks plain handler errors as failed", async () => {
    const executor = createExecutor(async () => "Error editing file 'src/app.ts': search text not found");

    const result = await executor.execute(createToolCall());

    assert.strictEqual(result.isError, true);
  });

  test("marks plain handler errors as failed after forced execution", async () => {
    const executor = createExecutor(async () => "Error: unable to read the requested file");

    const result = await executor.executeForced(createToolCall());

    assert.strictEqual(result.isError, true);
  });

  test("does not classify successful plain text as an error", async () => {
    const executor = createExecutor(async () => "File contents returned successfully");

    const result = await executor.execute(createToolCall());

    assert.strictEqual(result.isError, false);
  });

  test("preserves the analyzed workspace root in confirmation results", async () => {
    const executor = createExecutor(async () => JSON.stringify({
      requiresConfirmation: true,
      dangerLevel: "caution",
      warningMessage: "Review command",
      cwd: "C:\\workspace\\frontend",
      workspaceRoot: "C:\\workspace",
    }));

    const result = await executor.execute(createToolCall());
    const confirmation = ToolExecutor.isConfirmationRequired(result.result);

    assert.strictEqual(confirmation?.workspaceRoot, "C:\\workspace");
  });
});

function createExecutor(handler: () => Promise<string>): ToolExecutor {
  const registry = new ToolRegistry();
  registry.register({
    definition: testToolDefinition,
    handler,
    metadata: {
      dangerLevel: "safe",
      requiresConfirmation: false,
    },
  });
  return new ToolExecutor(registry);
}

function createToolCall(): ToolCall {
  return {
    id: "call_1",
    type: "function",
    function: {
      name: "read_file",
      arguments: JSON.stringify({ path: "src/app.ts" }),
    },
  };
}

const testToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "read_file",
    description: "Test tool",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};
