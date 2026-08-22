import { deepseekFetch } from "@/infrastructure/deepseek/client/DeepSeekFetch";
import { DEEPSEEK_PRO_MODEL_ID } from "@/contracts/deepseek/Models";
import { buildFimUrl } from "@/infrastructure/deepseek/endpoints/DeepSeekEndpoints";
import { readSSEStream } from "@/infrastructure/deepseek/streaming/ReadSSEStream";
import { MAX_CHAT_RESPONSE_BYTES, readBoundedJson } from "@/infrastructure/deepseek/client/BoundedResponseJson";

export interface FimRequest {
  model: typeof DEEPSEEK_PRO_MODEL_ID;
  prompt: string;
  suffix?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

export interface FimResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string;
    logprobs?: unknown;
  }>;
}

export async function fimCompletion(request: FimRequest, apiKey: string, baseUrl: string): Promise<FimResponse> {
  const url = buildFimUrl(getFimBaseUrl(baseUrl));
  const response = await deepseekFetch({
    pathOrUrl: url,
    apiKey,
    baseUrl,
    requestInit: {
      method: "POST",
      body: JSON.stringify({ ...request, stream: false }),
    },
  });
  return readBoundedJson(response, MAX_CHAT_RESPONSE_BYTES) as Promise<FimResponse>;
}

interface FimCompletionStreamOptions {
  request: FimRequest;
  apiKey: string;
  baseUrl: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

export async function fimCompletionStream(options: FimCompletionStreamOptions): Promise<void> {
  const { request, apiKey, baseUrl, onChunk, signal } = options;
  const url = buildFimUrl(getFimBaseUrl(baseUrl));
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
    throw new Error("Stream not available");
  }

  await readSSEStream({
    reader,
    onChunk: (data: unknown) => {
      const text = getFimText(data);
      if (text) {
        onChunk(text);
      }
    },
    onDone: () => {},
    signal,
  });
}

function getFimBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/beta") ? normalized : `${normalized}/beta`;
}

function getFimText(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return undefined;
  }
  const choice = choices[0];
  if (!choice || typeof choice !== "object") {
    return undefined;
  }
  const text = (choice as { text?: unknown }).text;
  return typeof text === "string" ? text : undefined;
}
