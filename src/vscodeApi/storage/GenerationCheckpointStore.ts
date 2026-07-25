import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import type { AppConfig, AssistantTimelineEvent, ConversationMessage, QueuedGenerationMessage, StoredToolCall } from "@/adapters";
import { writeJsonFileAtomic } from "./JsonFileStorage";
import { getCorruptGenerationCheckpointDirectory, getGenerationCheckpointDirectory } from "./UserDataPaths";

export interface GenerationCheckpoint {
  schemaVersion: 1;
  revision: number;
  conversationId: string;
  generationId?: string;
  status: "queued" | "starting" | "streaming" | "awaiting_confirmation" | "running_tool" | "interrupted" | "completed" | "error";
  userMessage?: ConversationMessage;
  content: string;
  timeline: AssistantTimelineEvent[];
  toolCalls: StoredToolCall[];
  queue: QueuedGenerationMessage[];
  config?: Omit<AppConfig, "apiKey">;
  workspaceUri: string;
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
    typeof record.updatedAt === "number";
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 512);
}
