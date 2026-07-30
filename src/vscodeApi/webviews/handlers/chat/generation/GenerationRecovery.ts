import { ConversationState } from "@/core/chat/ConversationState";
import type { StoredConversation } from "@/core/chat/ProviderTranscript";
import {
  type GenerationCheckpointStore,
  type HistoryManager,
  SettingsManager,
} from "@/vscodeApi/storage";
import { createLegacyWorkspaceBinding } from "@/vscodeApi/workspace";

export async function recoverGenerationCheckpoints(
  checkpointStore: GenerationCheckpointStore,
  historyManager: HistoryManager,
  recoveredDrafts: Map<string, Array<{
    clientRequestId: string;
    text: string;
    queuedAt: number;
  }>>,
): Promise<void> {
  const checkpoints = await checkpointStore.recover();
  for (const checkpoint of checkpoints) {
    if (checkpoint.queue.length > 0) {
      recoveredDrafts.set(checkpoint.conversationId, checkpoint.queue);
    }
    if (checkpoint.userMessage) {
      const existing = await historyManager.getById(checkpoint.conversationId);
      const state = new ConversationState(historyManager);
      if (existing) {
        state.load(existing);
      } else {
        const now = checkpoint.updatedAt;
        state.load({
          schemaVersion: 2,
          id: checkpoint.conversationId,
          title: "Recovered conversation",
          createdAt: now,
          updatedAt: now,
          messages: [],
          model: checkpoint.config?.model ?? SettingsManager.load().model,
          workspaceUri: checkpoint.workspaceUri,
          workspaceBinding:
            checkpoint.workspaceBinding ??
            createLegacyWorkspaceBinding(checkpoint.workspaceUri),
        });
      }

      const existingMessages = state.getConversation()?.messages ?? [];
      const messages: StoredConversation["messages"] = [];
      if (!existingMessages.some((message) => message.id === checkpoint.userMessage?.id)) {
        messages.push({ ...checkpoint.userMessage, generationId: checkpoint.generationId });
      }
      if (
        !existingMessages.some(
          (message) =>
            message.role === "assistant" &&
            message.generationId === checkpoint.generationId,
        ) &&
        (
          checkpoint.content ||
          checkpoint.timeline.length > 0 ||
          checkpoint.toolCalls.length > 0 ||
          checkpoint.providerTranscript
        )
      ) {
        const completed =
          checkpoint.status === "completed" &&
          checkpoint.providerTranscript?.status === "complete";
        messages.push(state.createMessage("assistant", checkpoint.content, {
          generationId: checkpoint.generationId,
          generationStatus: completed ? "completed" : "interrupted",
          timeline: checkpoint.timeline,
          providerTranscript: completed ? checkpoint.providerTranscript : undefined,
          toolCalls: checkpoint.toolCalls.map((tool) =>
            !completed &&
            (
              tool.status === "pending" ||
              tool.status === "awaiting_confirmation" ||
              tool.status === "running"
            )
              ? {
                  ...tool,
                  status: "cancelled",
                  result: tool.result ?? "Interrupted because VS Code closed.",
                  requiresConfirmation: false,
                  dangerConfirmation: undefined,
                }
              : tool,
          ),
        }));
      }
      if (messages.length > 0) {
        await state.saveMessages({
          messages,
          model: checkpoint.config?.model ?? SettingsManager.load().model,
        });
      }
    }
    await checkpointStore.delete(checkpoint.conversationId);
  }
}
