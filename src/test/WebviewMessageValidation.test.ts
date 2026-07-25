import * as assert from "assert";
import { isWebviewToHandlerMessage } from "@/vscodeApi/webviews/WebviewMessageValidation";

suite("webview message validation", () => {
  test("accepts every valid message shape", () => {
    const messages = [
      { type: "getConfig" },
      { type: "saveConfig", config: { interfaceLanguage: "es", permissionMode: "auto-approve", temperature: 1, maxTokens: 384_000, toolExecutionModes: { read_file: "auto_approve" } } },
      { type: "resetConfig" },
      { type: "testConnection", apiKey: "secret", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      { type: "sendMessage", clientRequestId: "request-1", text: "hello", modelId: "deepseek-v4-flash", reasoning: "high", conversationId: "conversation-1", referencedFiles: [{ path: "README.md", content: "text", type: "file" }] },
      { type: "steerGeneration", generationId: "generation-1", clientRequestId: "request-2", text: "guide", modelId: "deepseek-v4-flash", reasoning: "high", conversationId: "conversation-1" },
      { type: "cancelGeneration", generationId: "generation-1" },
      { type: "getGenerationSnapshot" },
      { type: "consumeRecoveredDraft", conversationId: "conversation-1", clientRequestId: "request-1" },
      { type: "copyCode", code: "const x = 1;" },
      { type: "insertCode", code: "const x = 1;" },
      { type: "selectModel", modelId: "deepseek-v4-flash" },
      { type: "newConversation" },
      { type: "getHistory" },
      { type: "loadConversation", id: "conversation-1" },
      { type: "deleteConversation", id: "conversation-1" },
      { type: "executeToolCall", generationId: "generation-1", toolCallId: "call-1", action: "execute", trustForSession: false },
      { type: "toolCallLimitDecision", generationId: "generation-1", action: "continue" },
      { type: "getPathCompletions", requestId: 1, query: "src/" },
      { type: "getAvailableTools" },
      { type: "openFile", path: "src/index.ts", line: 1 },
    ];

    for (const message of messages) {
      assert.strictEqual(isWebviewToHandlerMessage(message), true, JSON.stringify(message));
    }
  });

  test("rejects malformed, oversized and unexpected payloads", () => {
    const messages = [
      null,
      { type: "getConfig", injected: true },
      { type: "sendMessage", text: "", modelId: "model", reasoning: "high" },
      { type: "sendMessage", text: "hello", modelId: "model", reasoning: "invalid" },
      { type: "saveConfig", config: { permissionMode: "root" } },
      { type: "saveConfig", config: { temperature: Number.NaN } },
      { type: "saveConfig", config: { maxTokens: 384_001 } },
      { type: "saveConfig", config: { interfaceLanguage: "fr" } },
      { type: "saveConfig", config: { responseFormat: "json_object" } },
      { type: "testConnection", apiKey: "key", baseUrl: "file:///etc/passwd", model: "model" },
      { type: "executeToolCall", toolCallId: "call", action: "force" },
      { type: "toolCallLimitDecision", action: "later" },
      { type: "openFile", path: "file", line: 0 },
      { type: "copyCode", code: "x".repeat(2 * 1024 * 1024 + 1) },
    ];

    for (const message of messages) {
      assert.strictEqual(isWebviewToHandlerMessage(message), false, JSON.stringify(message)?.slice(0, 200));
    }
  });
});
