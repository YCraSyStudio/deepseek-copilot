import type * as vscode from "vscode";
import type { AppConfig, ChatCompletionRequest, ChatMessage, StreamChunk } from "@/adapters";
import type { BaseProvider } from "@/deepseekApi/BaseProvider";
import { createSystemMessage, mapReasoningEffort } from "@/adapters/deepseek/Chat";
import { PartialStreamError, type StreamedAssistantResult } from "@/core/errors/PartialStreamError";
import type { ProviderUsage } from "@/shared/usage/Usage";
import { StreamEventEmitter } from "./StreamEventEmitter";
import type { SendMessagePayload } from "./Types";

interface SendMessageStreamingOptions {
  messages: ChatMessage[];
  payload: SendMessagePayload;
  config: AppConfig;
  provider: BaseProvider;
  webviewView: vscode.WebviewView;
  signal: AbortSignal;
  onUsage?: (usage?: ProviderUsage) => void;
}

export async function sendMessageStreaming({ messages, payload, config, provider, webviewView, signal, onUsage }: SendMessageStreamingOptions): Promise<StreamedAssistantResult> {
  const hasSystemPrompt = messages.length > 0 && messages[0].role === "system";
  const request: ChatCompletionRequest = {
    model: payload.modelId || config.model,
    messages: hasSystemPrompt ? messages : [createSystemMessage(), ...messages],
    stream: true,
    thinking: payload.reasoning !== "off" ? { type: "enabled" } : { type: "disabled" },
    reasoning_effort: mapReasoningEffort(payload.reasoning),
  };

  const result: StreamedAssistantResult = { content: "", reasoning: "", timeline: [] };
  const stream = new StreamEventEmitter(webviewView);
  let finishReason: string | null | undefined;

  try {
    await provider.chatCompletionStream(
      request,
      (chunk: StreamChunk) => {
        if (chunk.type === "usage") {
          if (chunk.usage) {
            result.usage = chunk.usage;
          }
          return;
        }
        if (chunk.type === "done") {
          finishReason = chunk.finish_reason;
          return;
        }
        if (chunk.type === "content") {
          result.content += chunk.content ?? "";
        } else if (chunk.type === "reasoning") {
          result.reasoning += chunk.reasoning_content ?? "";
        }
        stream.fromChunk(chunk);
      },
      signal,
    );
  } catch (err: unknown) {
    result.timeline = stream.getTimeline();
    if (result.content || result.reasoning) {
      throw new PartialStreamError(
        isCancellationError(err) ? "Stream cancelled with partial content" : `Stream failed after partial content: ${getErrorMessage(err)}`,
        result,
        isCancellationError(err) ? "cancelled" : "failed",
      );
    }
    throw err;
  } finally {
    onUsage?.(result.usage);
  }

  result.timeline = stream.getTimeline();
  if (finishReason !== "stop") {
    const message = describeIncompleteFinish(finishReason);
    if (result.content || result.reasoning) {throw new PartialStreamError(message, result, "failed");}
    throw new Error(message);
  }
  stream.done({ finish_reason: finishReason });
  return result;
}

function describeIncompleteFinish(reason: string | null | undefined): string {
  switch (reason) {
    case "length": return "DeepSeek stopped because the output limit was reached. The response was saved as incomplete.";
    case "content_filter": return "DeepSeek stopped because content was filtered. The response was saved as incomplete.";
    case "insufficient_system_resource": return "DeepSeek stopped because provider resources were insufficient. The response was saved as incomplete.";
    case undefined:
    case null: return "DeepSeek ended without a terminal finish reason. The response was saved as incomplete.";
    default: return `DeepSeek ended with unsupported finish reason "${reason}". The response was saved as incomplete.`;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCancellationError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "Canceled");
}
