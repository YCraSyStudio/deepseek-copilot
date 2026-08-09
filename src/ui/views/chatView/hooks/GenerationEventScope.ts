import type { HandlerToWebviewMessage } from "@/contracts";

export interface GenerationEventScope {
  conversationId?: string;
  activeGenerationId?: string;
}

export function acceptMessageForScope(
  message: HandlerToWebviewMessage,
  scope: GenerationEventScope | undefined,
): boolean {
  if (!scope || message.type === "generationSnapshot") {
    return true;
  }
  if (!("conversationId" in message) || !("generationId" in message)) {
    return true;
  }
  return typeof message.conversationId === "string" &&
    typeof message.generationId === "string" &&
    message.conversationId === scope.conversationId &&
    message.generationId === scope.activeGenerationId;
}
