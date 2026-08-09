import { MAX_OUTPUT_TOKENS, WEBVIEW_INPUT_LIMITS, type AppConfig, type WebviewToHandlerMessage } from "@/contracts";
import { isAllowedApiBaseUrl } from "@/shared/security/ApiOrigin";

const MAX_CHAT_TEXT = WEBVIEW_INPUT_LIMITS.chatText;
const MAX_CODE_TEXT = 2 * 1024 * 1024;
const MAX_CHANGE_DIFF_TEXT = 2 * 1024 * 1024;
const MAX_REFERENCE_CONTENT = WEBVIEW_INPUT_LIMITS.referenceContent;
const MAX_TOTAL_REFERENCE_CONTENT = WEBVIEW_INPUT_LIMITS.totalReferenceContent;
const MAX_REFERENCES = WEBVIEW_INPUT_LIMITS.references;

export function isWebviewToHandlerMessage(value: unknown): value is WebviewToHandlerMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "initializeProtocol":
      return hasOnlyKeys(value, ["type", "protocolVersion"]) && value.protocolVersion === 3;
    case "getConfig":
    case "getHistory":
    case "getAvailableTools":
    case "getGenerationSnapshot":
      return hasOnlyKeys(value, ["type"]);
    case "newConversation":
      return hasOnlyKeys(value, ["type", "requestId"]) && isNonEmptyBoundedString(value.requestId, 128);
    case "selectContextFiles":
      return hasOnlyKeys(value, ["type", "conversationId"]) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512));
    case "getWorkspaceContext":
      return hasOnlyKeys(value, ["type", "requestId", "conversationId"]) &&
        isNonEmptyBoundedString(value.requestId, 128) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512));
    case "rebindConversationWorkspace":
      return hasOnlyKeys(value, ["type", "conversationId", "workspaceRevision"]) &&
        isNonEmptyBoundedString(value.conversationId, 512) &&
        isOptionalBoundedString(value.workspaceRevision, 256);
    case "openConversationWorkspace":
      return hasOnlyKeys(value, ["type", "conversationId"]) &&
        isNonEmptyBoundedString(value.conversationId, 512);
    case "resetConfig":
    case "deleteApiKey":
      return hasOnlyKeys(value, ["type", "requestId"]) && isNonEmptyBoundedString(value.requestId, 128);
    case "resolveHistoryTransition":
      return hasOnlyKeys(value, ["type", "requestId", "decision"]) &&
        isNonEmptyBoundedString(value.requestId, 128) &&
        (value.decision === "stop" || value.decision === "save" || value.decision === "discard" || value.decision === "cancel");
    case "cancelGeneration":
      return hasOnlyKeys(value, ["type", "requestId", "generationId", "conversationId"]) &&
        isNonEmptyBoundedString(value.requestId, 128) &&
        isNonEmptyBoundedString(value.generationId, 512) &&
        isNonEmptyBoundedString(value.conversationId, 512);
    case "consumeRecoveredDraft":
      return hasOnlyKeys(value, ["type", "conversationId", "clientRequestId"]) &&
        isNonEmptyBoundedString(value.conversationId, 512) &&
        isNonEmptyBoundedString(value.clientRequestId, 512);
    case "saveConfig":
      return hasOnlyKeys(value, ["type", "requestId", "config"]) &&
        isNonEmptyBoundedString(value.requestId, 128) &&
        isAppConfigPatch(value.config);
    case "testConnection":
      return (
        hasOnlyKeys(value, ["type", "apiKey", "baseUrl", "model"]) &&
        (value.apiKey === undefined || isNonEmptyBoundedString(value.apiKey, 16_384)) &&
        isAllowedApiBaseUrl(value.baseUrl) &&
        isNonEmptyBoundedString(value.model, 256)
      );
    case "sendMessage":
      return validateSendMessage(value);
    case "steerGeneration":
      return validateSendMessageFields(value, ["type", "generationId", "clientRequestId", "text", "modelId", "reasoning", "conversationId", "workspaceRevision", "referencedFiles"]) &&
        isNonEmptyBoundedString(value.generationId, 512) &&
        isNonEmptyBoundedString(value.conversationId, 512);
    case "copyCode":
      return hasOnlyKeys(value, ["type", "code"]) && isBoundedString(value.code, MAX_CODE_TEXT);
    case "insertCode":
      return hasOnlyKeys(value, ["type", "code", "conversationId", "workspaceRevision"]) &&
        isBoundedString(value.code, MAX_CODE_TEXT) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512)) &&
        isOptionalBoundedString(value.workspaceRevision, 256);
    case "selectModel":
      return hasOnlyKeys(value, ["type", "modelId"]) && isNonEmptyBoundedString(value.modelId, 256);
    case "deleteConversation":
      return hasOnlyKeys(value, ["type", "id"]) && isNonEmptyBoundedString(value.id, 512);
    case "loadConversation":
      return hasOnlyKeys(value, ["type", "requestId", "id"]) &&
        isNonEmptyBoundedString(value.requestId, 128) && isNonEmptyBoundedString(value.id, 512);
    case "loadConversationPage":
      return hasOnlyKeys(value, ["type", "requestId", "id", "cursor"]) &&
        isNonEmptyBoundedString(value.requestId, 128) &&
        isNonEmptyBoundedString(value.id, 512) && isNonEmptyBoundedString(value.cursor, 512);
    case "deleteConversations":
      return hasOnlyKeys(value, ["type", "ids"]) && Array.isArray(value.ids) && value.ids.length <= 100 && value.ids.every((id) => isNonEmptyBoundedString(id, 512));
    case "executeToolCall":
      return (
        hasOnlyKeys(value, ["type", "generationId", "toolCallId", "action", "trustForSession"]) &&
        isNonEmptyBoundedString(value.generationId, 512) &&
        isNonEmptyBoundedString(value.toolCallId, 512) &&
        (value.action === "execute" || value.action === "reject") &&
        isOptionalBoolean(value.trustForSession)
      );
    case "toolCallLimitDecision":
      return hasOnlyKeys(value, ["type", "generationId", "action"]) &&
        isNonEmptyBoundedString(value.generationId, 512) &&
        (value.action === "continue" || value.action === "stop");
    case "getPathCompletions":
      return (
        hasOnlyKeys(value, ["type", "requestId", "query", "conversationId", "workspaceRevision"]) &&
        Number.isSafeInteger(value.requestId) &&
        (value.requestId as number) >= 0 &&
        isBoundedString(value.query, 4096) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512)) &&
        isOptionalBoundedString(value.workspaceRevision, 256)
      );
    case "openFile":
      return (
        hasOnlyKeys(value, ["type", "path", "line", "conversationId", "workspaceRevision"]) &&
        isNonEmptyBoundedString(value.path, 32_768) &&
        (value.line === undefined || (Number.isSafeInteger(value.line) && (value.line as number) >= 1)) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512)) &&
        isOptionalBoundedString(value.workspaceRevision, 256)
      );
    case "openFileDiff":
      return (
        hasOnlyKeys(value, ["type", "path", "diff", "conversationId", "workspaceRevision"]) &&
        isNonEmptyBoundedString(value.path, 32_768) &&
        isNonEmptyBoundedString(value.diff, MAX_CHANGE_DIFF_TEXT) &&
        (value.conversationId === undefined || isNonEmptyBoundedString(value.conversationId, 512)) &&
        isOptionalBoundedString(value.workspaceRevision, 256)
      );
    default:
      return false;
  }
}

function validateSendMessage(value: Record<string, unknown>): boolean {
  return validateSendMessageFields(value, ["type", "clientRequestId", "text", "modelId", "reasoning", "conversationId", "workspaceRevision", "referencedFiles"]);
}

function validateSendMessageFields(value: Record<string, unknown>, keys: readonly string[]): boolean {
  if (
    !hasOnlyKeys(value, keys) ||
    !isNonEmptyBoundedString(value.clientRequestId, 512) ||
    !isNonEmptyBoundedString(value.text, MAX_CHAT_TEXT) ||
    !isNonEmptyBoundedString(value.modelId, 256) ||
    (value.reasoning !== "off" && value.reasoning !== "high" && value.reasoning !== "max") ||
    (value.conversationId !== undefined && !isNonEmptyBoundedString(value.conversationId, 512)) ||
    !isOptionalBoundedString(value.workspaceRevision, 256)
  ) {
    return false;
  }

  if (value.referencedFiles === undefined) {
    return true;
  }
  if (!Array.isArray(value.referencedFiles) || value.referencedFiles.length > MAX_REFERENCES) {
    return false;
  }

  let totalContent = 0;
  for (const reference of value.referencedFiles) {
    if (
      !isRecord(reference) ||
      !hasOnlyKeys(reference, ["path", "content", "type", "selection", "referenceId", "scope", "rootUri", "bindingRevision"]) ||
      !isNonEmptyBoundedString(reference.path, 32_768) ||
      (reference.type !== "file" && reference.type !== "directory") ||
      (reference.content !== undefined && !isBoundedString(reference.content, MAX_REFERENCE_CONTENT)) ||
      (reference.selection !== undefined && !isSelectionRange(reference.selection)) ||
      (reference.referenceId !== undefined && !isNonEmptyBoundedString(reference.referenceId, 512)) ||
      (reference.scope !== undefined && reference.scope !== "workspace" && reference.scope !== "external-snapshot") ||
      !isOptionalBoundedString(reference.rootUri, 32_768) ||
      !isOptionalBoundedString(reference.bindingRevision, 256)
    ) {
      return false;
    }
    totalContent += typeof reference.content === "string" ? reference.content.length : 0;
    if (totalContent > MAX_TOTAL_REFERENCE_CONTENT) {
      return false;
    }
  }
  return true;
}

function isSelectionRange(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["startLine", "startCharacter", "endLine", "endCharacter"]) &&
    [value.startLine, value.startCharacter, value.endLine, value.endCharacter].every((part) => Number.isSafeInteger(part) && (part as number) >= 1);
}

const APP_CONFIG_KEYS = [
  "interfaceLanguage",
  "apiKey",
  "baseUrl",
  "model",
  "thinkingMode",
  "reasoningEffort",
  "temperature",
  "topP",
  "maxTokens",
  "maxToolRounds",
  "maxConcurrentGenerations",
  "permissionMode",
  "toolExecutionModes",
  "autoContext",
  "historyEnabled",
  "historyRetentionDays",
  "includeHomeAgents",
  "userId",
  "usageBreakdown",
  "webSearchEngine",
] as const satisfies readonly (keyof AppConfig)[];

function isAppConfigPatch(value: unknown): value is Partial<AppConfig> {
  if (!isRecord(value) || !hasOnlyKeys(value, APP_CONFIG_KEYS)) {
    return false;
  }

  return (
    (value.interfaceLanguage === undefined || value.interfaceLanguage === "auto" || value.interfaceLanguage === "en" || value.interfaceLanguage === "es" || value.interfaceLanguage === "zh") &&
    isOptionalBoundedString(value.apiKey, 16_384) &&
    (value.baseUrl === undefined || isAllowedApiBaseUrl(value.baseUrl)) &&
    (value.model === undefined || isNonEmptyBoundedString(value.model, 256)) &&
    isOptionalBoolean(value.thinkingMode) &&
    (value.reasoningEffort === undefined || value.reasoningEffort === "high" || value.reasoningEffort === "max") &&
    isOptionalNumberInRange(value.temperature, 0, 2) &&
    isOptionalNumberInRange(value.topP, 0, 1) &&
    (value.maxTokens === undefined || (Number.isSafeInteger(value.maxTokens) && (value.maxTokens as number) >= 1 && (value.maxTokens as number) <= MAX_OUTPUT_TOKENS)) &&
    (value.maxToolRounds === undefined || (Number.isSafeInteger(value.maxToolRounds) && (value.maxToolRounds as number) >= 1 && (value.maxToolRounds as number) <= 20)) &&
    (value.maxConcurrentGenerations === undefined || (Number.isSafeInteger(value.maxConcurrentGenerations) && (value.maxConcurrentGenerations as number) >= 1 && (value.maxConcurrentGenerations as number) <= 16)) &&
    (value.permissionMode === undefined || ["default", "read-only", "auto-approve", "full-access", "custom"].includes(value.permissionMode as string)) &&
    (value.toolExecutionModes === undefined || isToolExecutionModes(value.toolExecutionModes)) &&
    isOptionalBoolean(value.autoContext) &&
    isOptionalBoolean(value.historyEnabled) &&
    (value.historyRetentionDays === undefined || (Number.isSafeInteger(value.historyRetentionDays) && (value.historyRetentionDays as number) >= 0 && (value.historyRetentionDays as number) <= 3650)) &&
    isOptionalBoolean(value.includeHomeAgents) &&
    isOptionalBoolean(value.usageBreakdown) &&
    (value.webSearchEngine === undefined || value.webSearchEngine === "bing" || value.webSearchEngine === "google" || value.webSearchEngine === "baidu") &&
    isOptionalBoundedString(value.userId, 256)
  );
}

function isToolExecutionModes(value: unknown): boolean {
  if (!isRecord(value) || Object.keys(value).length > 100) {
    return false;
  }
  return Object.entries(value).every(
    ([name, mode]) => /^[a-zA-Z0-9_-]{1,128}$/.test(name) && (mode === "disabled" || mode === "enabled" || mode === "auto_approve"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isNonEmptyBoundedString(value: unknown, maxLength: number): value is string {
  return isBoundedString(value, maxLength) && value.trim().length > 0;
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || isBoundedString(value, maxLength);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNumberInRange(value: unknown, min: number, max: number): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
}
