import type { ConversationMessage } from "@/contracts";

export function shouldShowGenerationTerminalStatus(
  generationStatus: ConversationMessage["generationStatus"],
  generationStopReason: ConversationMessage["generationStopReason"],
): boolean {
  return (generationStatus === "cancelled" || generationStatus === "interrupted") &&
    generationStopReason !== "steered";
}
