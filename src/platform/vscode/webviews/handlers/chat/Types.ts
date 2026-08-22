import type { ImageAttachment, ReferencedFile } from "@/contracts";
import type { SteeringContinuation } from "@/application/chat/SteeringContinuation";

export interface SendMessagePayload {
  clientRequestId: string;
  text: string;
  modelId: string;
  reasoning: string;
  conversationId?: string;
  workspaceRevision?: string;
  referencedFiles?: ReferencedFile[];
  imageAttachments?: ImageAttachment[];
  steering?: SteeringContinuation;
}
