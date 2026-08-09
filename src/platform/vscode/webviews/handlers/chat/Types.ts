import type { ReferencedFile } from "@/contracts";

export interface SendMessagePayload {
  clientRequestId: string;
  text: string;
  modelId: string;
  reasoning: string;
  conversationId?: string;
  workspaceRevision?: string;
  referencedFiles?: ReferencedFile[];
}
