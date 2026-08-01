import * as assert from "assert";
import { isWebviewToHandlerMessage } from "@/vscodeApi/webviews/WebviewMessageValidation";

suite("webview message validation", () => {
  test("accepts every valid message shape", () => {
    const messages = [
      { type: "initializeProtocol", protocolVersion: 1 },
      { type: "getConfig" },
      { type: "saveConfig", requestId: "config-1", config: { interfaceLanguage: "es", permissionMode: "auto-approve", temperature: 1, maxTokens: 384_000, toolExecutionModes: { read_file: "auto_approve" } } },
      { type: "saveConfig", requestId: "config-custom", config: { permissionMode: "custom", toolExecutionModes: { read_file: "enabled", create_file: "disabled" } } },
      { type: "saveConfig", requestId: "config-default", config: { permissionMode: "default" } },
      { type: "saveConfig", requestId: "config-read-only", config: { permissionMode: "read-only" } },
      { type: "resetConfig", requestId: "config-2" },
      { type: "resolveHistoryTransition", requestId: "history-1", decision: "stop" },
      { type: "resolveHistoryTransition", requestId: "history-2", decision: "save" },
      { type: "resolveHistoryTransition", requestId: "history-3", decision: "discard" },
      { type: "resolveHistoryTransition", requestId: "history-4", decision: "cancel" },
      { type: "deleteApiKey", requestId: "credential-1" },
      { type: "testConnection", apiKey: "secret", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      { type: "testConnection", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      { type: "testConnection", baseUrl: "http://127.0.0.1:11434/v1", model: "local-model" },
      { type: "sendMessage", clientRequestId: "request-1", text: "hello", modelId: "deepseek-v4-flash", reasoning: "high", conversationId: "conversation-1", referencedFiles: [{ path: "README.md", content: "text", type: "file" }] },
      { type: "steerGeneration", generationId: "generation-1", clientRequestId: "request-2", text: "guide", modelId: "deepseek-v4-flash", reasoning: "high", conversationId: "conversation-1" },
      { type: "cancelGeneration", generationId: "generation-1" },
      { type: "getGenerationSnapshot" },
      { type: "consumeRecoveredDraft", conversationId: "conversation-1", clientRequestId: "request-1" },
      { type: "copyCode", code: "const x = 1;" },
      { type: "insertCode", code: "const x = 1;" },
      { type: "selectModel", modelId: "deepseek-v4-flash" },
      { type: "newConversation" },
      { type: "getWorkspaceContext", conversationId: "conversation-1" },
      { type: "rebindConversationWorkspace", conversationId: "conversation-1", workspaceRevision: "revision-1" },
      { type: "openConversationWorkspace", conversationId: "conversation-1" },
      { type: "selectContextFiles", conversationId: "conversation-1" },
      { type: "getHistory" },
      { type: "loadConversation", id: "conversation-1" },
      { type: "deleteConversation", id: "conversation-1" },
      { type: "executeToolCall", generationId: "generation-1", toolCallId: "call-1", action: "execute", trustForSession: false },
      { type: "toolCallLimitDecision", generationId: "generation-1", action: "continue" },
      { type: "getPathCompletions", requestId: 1, query: "./src/", conversationId: "conversation-1", workspaceRevision: "revision-1" },
      { type: "getAvailableTools" },
      { type: "openFile", path: "src/index.ts", line: 1 },
      { type: "openFileDiff", path: "src/index.ts", diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,1 +1,1 @@\n-old\n+new" },
    ];

    for (const message of messages) {
      assert.strictEqual(isWebviewToHandlerMessage(message), true, JSON.stringify(message));
    }
  });

  test("rejects malformed, oversized and unexpected payloads", () => {
    const messages = [
      null,
      { type: "initializeProtocol", protocolVersion: 0 },
      { type: "initializeProtocol", protocolVersion: 1, injected: true },
      { type: "getConfig", injected: true },
      { type: "resetConfig" },
      { type: "resolveHistoryTransition", requestId: "history", decision: "wait" },
      { type: "resolveHistoryTransition", decision: "cancel" },
      { type: "deleteApiKey" },
      { type: "deleteApiKey", requestId: "credential-1", injected: true },
      { type: "sendMessage", text: "", modelId: "model", reasoning: "high" },
      { type: "sendMessage", text: "hello", modelId: "model", reasoning: "invalid" },
      { type: "saveConfig", requestId: "legacy-enabled", config: { permissionMode: "enabled" } },
      { type: "saveConfig", requestId: "bad-1", config: { permissionMode: "root" } },
      { type: "saveConfig", requestId: "bad-workspace", config: { permissionMode: "workspace" } },
      { type: "saveConfig", requestId: "bad-2", config: { temperature: Number.NaN } },
      { type: "saveConfig", requestId: "bad-3", config: { maxTokens: 384_001 } },
      { type: "saveConfig", requestId: "bad-4", config: { interfaceLanguage: "fr" } },
      { type: "saveConfig", requestId: "bad-5", config: { responseFormat: "json_object" } },
      { type: "testConnection", apiKey: "key", baseUrl: "file:///etc/passwd", model: "model" },
      { type: "testConnection", apiKey: "key", baseUrl: "http://api.deepseek.com", model: "model" },
      { type: "testConnection", apiKey: "key", baseUrl: "https://user:pass@api.deepseek.com", model: "model" },
      { type: "saveConfig", requestId: "bad-http", config: { baseUrl: "http://example.test" } },
      { type: "executeToolCall", toolCallId: "call", action: "force" },
      { type: "toolCallLimitDecision", action: "later" },
      { type: "openFile", path: "file", line: 0 },
      { type: "openFileDiff", path: "file", diff: "x".repeat(2 * 1024 * 1024 + 1) },
      { type: "openFileDiff", path: "file", diff: "change", injected: true },
      { type: "copyCode", code: "x".repeat(2 * 1024 * 1024 + 1) },
      { type: "rebindConversationWorkspace", conversationId: "" },
      { type: "selectContextFiles", injected: true },
      { type: "sendMessage", clientRequestId: "large", text: "x".repeat(1024 * 1024 + 1), modelId: "model", reasoning: "high" },
      {
        type: "sendMessage",
        clientRequestId: "references",
        text: "hello",
        modelId: "model",
        reasoning: "high",
        referencedFiles: Array.from({ length: 51 }, (_, index) => ({ path: `file-${index}`, type: "file" })),
      },
    ];

    for (const message of messages) {
      assert.strictEqual(isWebviewToHandlerMessage(message), false, JSON.stringify(message)?.slice(0, 200));
    }
  });
});
