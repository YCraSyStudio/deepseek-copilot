import type { AppConfig, ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from "@/adapters";

export abstract class BaseProvider {
  public abstract readonly name: string;
  public abstract readonly id: string;

  constructor(protected config: AppConfig) {}

  /** Chat completion without streaming. */
  abstract chatCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;

  /** Chat completion with callback-based streaming. */
  abstract chatCompletionStream(request: ChatCompletionRequest, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal): Promise<void>;

  /** Test API connectivity. */
  abstract testConnection(): Promise<{ success: boolean; error?: string }>;

  /** List available models. */
  abstract listModels(): Promise<Array<{ id: string; name: string }>>;

  /** Update provider configuration. */
  updateConfig(config: Partial<AppConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
