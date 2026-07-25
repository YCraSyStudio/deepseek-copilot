export interface SendMessagePayload {
  clientRequestId: string;
  text: string;
  modelId: string;
  reasoning: string;
  conversationId?: string;
  referencedFiles?: Array<{ path: string; content?: string; type: "file" | "directory" }>;
}
