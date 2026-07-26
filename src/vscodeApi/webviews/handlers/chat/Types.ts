import type { ReferencedFile } from "@/adapters";

export interface SendMessagePayload {
  clientRequestId: string;
  text: string;
  modelId: string;
  reasoning: string;
  conversationId?: string;
  workspaceRevision?: string;
  referencedFiles?: ReferencedFile[];
}
