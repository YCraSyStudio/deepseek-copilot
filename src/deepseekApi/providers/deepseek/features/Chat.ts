import { deepseekFetch } from "@/deepseekApi/client/DeepSeekFetch";
import { buildChatUrl } from "@/deepseekApi/endpoints/DeepSeekEndpoints";
import { readSSEStream } from "@/deepseekApi/streaming/ReadSSEStream";
import type { AppConfig, ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from "@/adapters";
import { DEEPSEEK_DEFAULTS } from "../DeepSeekConfig";
import { parseChatCompletionResponse, parseStreamToolCalls } from "./ChatResponseValidation";

interface DeepSeekChatRequest extends ChatCompletionRequest {
  user_id?: string;
}

export type ChatRequest = DeepSeekChatRequest;
export type ChatResponse = ChatCompletionResponse;
export type ChatStreamChunk = StreamChunk;

export function buildChatBody(request: Partial<ChatRequest>, config: AppConfig): Partial<ChatRequest> {
  const body: Partial<ChatRequest> = {
    model: request.model || config.model || DEEPSEEK_DEFAULTS.model,
    stream: request.stream ?? true,
  };

  const thinkingEnabled = config.thinkingMode ?? DEEPSEEK_DEFAULTS.thinkingMode;
  if (thinkingEnabled) {
    body.thinking = { type: "enabled" };
    const reasoningEffort = request.reasoning_effort ?? config.reasoningEffort;
    if (reasoningEffort) {
      body.reasoning_effort = reasoningEffort;
    }
  } else {
    body.thinking = { type: "disabled" };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    } else {
      body.temperature = config.temperature ?? DEEPSEEK_DEFAULTS.temperature;
    }
    if (request.top_p !== undefined) {
      body.top_p = request.top_p;
    } else {
      body.top_p = config.topP ?? DEEPSEEK_DEFAULTS.topP;
    }
  }

  if (request.max_tokens !== undefined) {
    body.max_tokens = request.max_tokens;
  } else {
    body.max_tokens = config.maxTokens ?? DEEPSEEK_DEFAULTS.maxTokens;
  }
  if (request.stop) {
    body.stop = request.stop;
  }
  if (request.tools) {
    body.tools = request.tools;
  }
  if (request.tool_choice) {
    body.tool_choice = request.tool_choice;
  }
  if (request.user_id) {
    body.user_id = request.user_id;
  } else if (config.userId) {
    body.user_id = config.userId;
  }

  return body;
}

export async function chatCompletion(request: ChatRequest, apiKey: string, baseUrl: string, signal?: AbortSignal): Promise<ChatResponse> {
  const url = buildChatUrl(baseUrl);
  const response = await deepseekFetch({
    pathOrUrl: url,
    apiKey,
    baseUrl,
    requestInit: {
      method: "POST",
      body: JSON.stringify({ ...request, stream: false }),
      signal,
    },
  });
  return parseChatCompletionResponse(await response.json());
}

interface ChatCompletionStreamOptions {
  request: ChatRequest;
  apiKey: string;
  baseUrl: string;
  onChunk: (chunk: ChatStreamChunk) => void;
  signal?: AbortSignal;
}

export async function chatCompletionStream(options: ChatCompletionStreamOptions): Promise<void> {
  const { request, apiKey, baseUrl, onChunk, signal } = options;
  const url = buildChatUrl(baseUrl);
  let finishReason = "stop";
  let emittedDone = false;

  const emitDone = () => {
    if (emittedDone) {
      return;
    }
    emittedDone = true;
    onChunk({ type: "done", finish_reason: finishReason });
  };

  const response = await deepseekFetch({
    pathOrUrl: url,
    apiKey,
    baseUrl,
    requestInit: {
      method: "POST",
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    },
  });

  const reader = response.body?.getReader();
  if (!reader) {
    onChunk({ type: "error", error: "Stream not available" });
    return;
  }

  await readSSEStream({
    reader,
    onChunk: (data: unknown) => {
      const chunk = getDeepSeekStreamChoice(data);
      const delta = chunk?.delta;
      const finish_reason = chunk?.finish_reason;

      if (!delta) {
        if (finish_reason) {
          finishReason = finish_reason;
        }
        return;
      }

      if (finish_reason) {
        finishReason = finish_reason;
      }

      if (typeof delta.reasoning_content === "string") {
        onChunk({ type: "reasoning", reasoning_content: delta.reasoning_content });
      }
      if (typeof delta.content === "string") {
        onChunk({ type: "content", content: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        onChunk({ type: "tool_call", tool_calls: parseStreamToolCalls(delta.tool_calls) });
      }
    },
    onDone: emitDone,
    signal,
  });
}

interface DeepSeekStreamDelta {
  reasoning_content?: unknown;
  content?: unknown;
  tool_calls?: unknown;
}

interface DeepSeekStreamChoice {
  delta?: DeepSeekStreamDelta;
  finish_reason?: string;
}

function getDeepSeekStreamChoice(data: unknown): DeepSeekStreamChoice | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const choice = choices[0];
  return choice && typeof choice === "object" ? (choice as DeepSeekStreamChoice) : undefined;
}
