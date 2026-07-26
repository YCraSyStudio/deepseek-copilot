import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import type { AppConfig, AssistantTimelineEvent, ConversationMessage, PermissionSnapshot, QueuedGenerationMessage, StoredToolCall, WorkspaceBinding } from "@/adapters";
import { isWorkspaceBinding } from "@/core/chat/ConversationValidation";
import { isProviderTranscript, type ProviderTranscript } from "@/core/chat/ProviderTranscript";
import { writeJsonFileAtomic } from "./JsonFileStorage";
import { getCorruptGenerationCheckpointDirectory, getGenerationCheckpointDirectory } from "./UserDataPaths";

export interface GenerationCheckpoint {
  schemaVersion: 1;
  revision: number;
  conversationId: string;
  generationId?: string;
  status: "queued" | "starting" | "compacting" | "streaming" | "awaiting_confirmation" | "running_tool" | "interrupted" | "completed" | "error";
  userMessage?: ConversationMessage;
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls: StoredToolCall[];
  queue: QueuedGenerationMessage[];
  config?: Omit<AppConfig, "apiKey">;
  permissionSnapshot?: PermissionSnapshot;
  providerTranscript?: ProviderTranscript;
  workspaceUri: string;
  workspaceBinding?: WorkspaceBinding;
  updatedAt: number;
}

export class GenerationCheckpointStore {
  private readonly revisions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  async save(checkpoint: Omit<GenerationCheckpoint, "schemaVersion" | "revision">): Promise<GenerationCheckpoint> {
    const revision = (this.revisions.get(checkpoint.conversationId) ?? 0) + 1;
    this.revisions.set(checkpoint.conversationId, revision);
    const value: GenerationCheckpoint = { schemaVersion: 1, revision, ...checkpoint };
    await this.enqueue(checkpoint.conversationId, async () => {
      if ((this.revisions.get(checkpoint.conversationId) ?? 0) !== revision) {
        return;
      }
      await writeJsonFileAtomic(this.getPath(checkpoint.conversationId), value);
    });
    return value;
  }

  async delete(conversationId: string): Promise<void> {
    this.revisions.delete(conversationId);
    await this.enqueue(conversationId, () => rm(this.getPath(conversationId), { force: true }));
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.queues.values());
  }

  async recover(): Promise<GenerationCheckpoint[]> {
    const directory = getGenerationCheckpointDirectory();
    await mkdir(directory, { recursive: true });
    const entries = await readdir(directory, { withFileTypes: true });
    const checkpoints: GenerationCheckpoint[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(directory, entry.name);
      try {
        const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
        if (!isGenerationCheckpoint(parsed)) {
          throw new Error("Invalid generation checkpoint");
        }
        this.revisions.set(parsed.conversationId, parsed.revision);
        checkpoints.push(parsed);
      } catch {
        await mkdir(getCorruptGenerationCheckpointDirectory(), { recursive: true });
        await rename(filePath, path.join(getCorruptGenerationCheckpointDirectory(), `${Date.now()}-${entry.name}`)).catch(() => undefined);
      }
    }
    return checkpoints;
  }

  private getPath(conversationId: string): string {
    return path.join(getGenerationCheckpointDirectory(), `${safeFileName(conversationId)}.json`);
  }

  private enqueue(conversationId: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(conversationId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.queues.set(conversationId, next.catch(() => undefined));
    return next;
  }
}

function isGenerationCheckpoint(value: unknown): value is GenerationCheckpoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<GenerationCheckpoint>;
  return record.schemaVersion === 1 &&
    Number.isSafeInteger(record.revision) &&
    typeof record.conversationId === "string" &&
    typeof record.status === "string" &&
    typeof record.content === "string" &&
    Array.isArray(record.timeline) &&
    Array.isArray(record.toolCalls) &&
    Array.isArray(record.queue) &&
    typeof record.workspaceUri === "string" &&
    (record.workspaceBinding === undefined || isWorkspaceBinding(record.workspaceBinding)) &&
    (record.permissionSnapshot === undefined || isPermissionSnapshot(record.permissionSnapshot)) &&
    (record.providerTranscript === undefined || isProviderTranscript(record.providerTranscript)) &&
    typeof record.updatedAt === "number";
}

function isPermissionSnapshot(value: unknown): value is PermissionSnapshot {
  if (!value || typeof value !== "object") {return false;}
  const snapshot = value as Partial<PermissionSnapshot>;
  return Number.isSafeInteger(snapshot.revision) &&
    typeof snapshot.workspaceTrusted === "boolean" &&
    typeof snapshot.fingerprint === "string" &&
    (snapshot.permissionMode === "chat" || snapshot.permissionMode === "read-only" || snapshot.permissionMode === "workspace" ||
      snapshot.permissionMode === "full-access" || snapshot.permissionMode === "auto-approve") &&
    !!snapshot.toolExecutionModes &&
    typeof snapshot.toolExecutionModes === "object";
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 512);
}
