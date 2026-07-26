import { BaseProvider } from "../../BaseProvider";
import type { AppConfig, ChatCompletionRequest, ChatCompletionResponse, StreamChunk } from "@/adapters";
import { chatCompletion, chatCompletionStream, buildChatBody, type ChatRequest } from "./features/Chat";
import { listModels } from "./Models";

export class DeepSeekProvider extends BaseProvider {
  public readonly name = "DeepSeek";
  public readonly id = "deepseek";

  constructor(config: AppConfig) {
    super(config);
  }

  async chatCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse> {
    const chatRequest = this._applyDefaults(request);
    const body = buildChatBody(chatRequest, this.config);
    const response = await chatCompletion({ ...chatRequest, ...body } as ChatRequest, this.config.apiKey, this.config.baseUrl, signal);
    return response;
  }

  async chatCompletionStream(request: ChatCompletionRequest, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal): Promise<void> {
    const chatRequest = this._applyDefaults(request);
    const body = buildChatBody(chatRequest, this.config);

    await chatCompletionStream({
      request: { ...chatRequest, ...body } as ChatRequest,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      onChunk: (chunk: StreamChunk) => {
        onChunk(chunk);
      },
      signal,
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await chatCompletion(
        {
          model: this.config.model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 2,
          thinking: { type: "disabled" },
        },
        this.config.apiKey,
        this.config.baseUrl,
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const models = await listModels(this.config.apiKey, this.config.baseUrl);
    return models.map((m) => ({ id: m.id, name: m.id }));
  }

  private _applyDefaults(req: ChatCompletionRequest): Partial<ChatRequest> {
    const deepSeekRequest = req as Partial<ChatRequest>;

    return {
      model: req.model || this.config.model,
      messages: req.messages,
      stream: req.stream,
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      top_p: req.top_p,
      thinking: req.thinking,
      reasoning_effort: req.reasoning_effort,
      stop: req.stop,
      tools: req.tools,
      tool_choice: req.tool_choice,
      user_id: deepSeekRequest.user_id,
    };
  }
}
