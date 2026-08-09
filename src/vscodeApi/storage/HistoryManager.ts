import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Conversation, ConversationSummary } from "@/adapters";
import { createConversationTitle } from "@/core/chat/ConversationTitle";
import { findDuplicateConversationIds } from "@/core/chat/ConversationDeduplication";
import { isConversation } from "@/core/chat/ConversationValidation";
import {
  getFinalAssistantContent,
  isConversationContextSummary,
  sanitizeStoredTranscript,
} from "@/core/chat/ProviderTranscript";
import { SettingsManager } from "./SettingsManager";
import { withFileLock, writeJsonFileAtomic } from "./JsonFileStorage";
import { getCorruptHistoryDirectory, getHistoryDirectory } from "./UserDataPaths";
import { captureCurrentWorkspaceBinding } from "@/vscodeApi/workspace";
import { createLegacyWorkspaceBinding } from "@/vscodeApi/workspace";
import { migrateLegacyConversations } from "@/infrastructure/persistence/LegacyConversationMigration";

const MAX_CONVERSATIONS = 100;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_CONVERSATION_BYTES = MAX_TOTAL_BYTES;

interface StoredConversationRecord {
  conversation: StoredConversationData;
  filePath: string;
  sizeBytes: number;
}

type StoredConversationData = import("@/core/chat/ProviderTranscript").StoredConversation;

export class HistoryManager {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    await withFileLock(getHistoryMutationTarget(), async () => {
      await migrateLegacyConversations({
        historyDirectory: getHistoryDirectory(),
        workspaceState: this.context.workspaceState,
        createWorkspaceBinding: createLegacyWorkspaceBinding,
      });
    });
  }

  getWorkspaceUri(): string {
    return this.getWorkspaceBinding().uri;
  }

  getWorkspaceBinding() {
    return captureCurrentWorkspaceBinding();
  }

  async getSummaries(): Promise<ConversationSummary[]> {
    if (!SettingsManager.load().historyEnabled) {return [];}
    await this.waitForPendingMutations();
    return withFileLock(getHistoryMutationTarget(), async () => {
      const records = await this.readAll();
      const retained = await this.applyRetentionAndLimits(records);
      return retained.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  async save(conversation: StoredConversationData): Promise<void> {
    if (!SettingsManager.load().historyEnabled) {return;}
    const normalized = normalizeConversation(conversation);
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_CONVERSATION_BYTES) {
      throw new Error("Conversation is too large to save safely. Reduce its retained context before continuing.");
    }
    await this.enqueueMutation(async () => {
      const current = await readConversationFile(normalized.id);
      if (current && (
        current.updatedAt > normalized.updatedAt ||
        (current.updatedAt === normalized.updatedAt && JSON.stringify(current) !== JSON.stringify(normalized))
      )) {
        throw new Error("Conversation changed in another VS Code window. Reload it before saving more messages.");
      }
      await writeJsonFileAtomic(getConversationPath(normalized.id), normalized);
      await this.applyRetentionAndLimits(await this.readAll());
    });
  }

  async delete(id: string, expectedUpdatedAt?: number): Promise<boolean> {
    const deleted = await this.deleteMany([{ id, expectedUpdatedAt }]);
    return deleted.includes(id);
  }

  async deleteMany(entries: Array<string | { id: string; expectedUpdatedAt?: number }>): Promise<string[]> {
    if (!SettingsManager.load().historyEnabled) {return [];}
    const uniqueEntries = [...new Map(entries.map((entry) => {
      const normalized = typeof entry === "string" ? { id: entry } : entry;
      return [normalized.id, normalized];
    })).values()];
    const deleted: string[] = [];
    await this.enqueueMutation(async () => {
      for (const entry of uniqueEntries) {
        if (entry.expectedUpdatedAt !== undefined) {
          const current = await readConversationFile(entry.id);
          if (!current || current.updatedAt !== entry.expectedUpdatedAt) {continue;}
        }
        await rm(getConversationPath(entry.id), { force: true });
        deleted.push(entry.id);
      }
    });
    return deleted;
  }

  async saveIfAbsent(conversation: StoredConversationData): Promise<boolean> {
    if (!SettingsManager.load().historyEnabled) {return false;}
    let saved = false;
    await this.enqueueMutation(async () => {
      if (await readConversationFile(conversation.id)) {return;}
      await writeJsonFileAtomic(getConversationPath(conversation.id), normalizeConversation(conversation));
      saved = true;
    });
    return saved;
  }

  async getById(id: string): Promise<StoredConversationData | undefined> {
    if (!SettingsManager.load().historyEnabled) {return undefined;}
    await this.waitForPendingMutations();
    const filePath = getConversationPath(id);
    try {
      const metadata = await stat(filePath);
      if (metadata.size > MAX_CONVERSATION_BYTES) {
        await isolateCorruptHistoryFile(filePath);
        return undefined;
      }
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      if (!isConversation(parsed) || parsed.id !== id) {
        await isolateCorruptHistoryFile(filePath);
        return undefined;
      }
      return normalizeConversation(parsed);
    } catch (error) {
      if (isFileNotFoundError(error)) {return undefined;}
      await isolateCorruptHistoryFile(filePath);
      return undefined;
    }
  }

  private async readAll(): Promise<StoredConversationRecord[]> {
    await mkdir(getHistoryDirectory(), { recursive: true });
    const entries = await readdir(getHistoryDirectory(), { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readStoredConversation(path.join(getHistoryDirectory(), entry.name))),
    );
    return records.filter((record): record is StoredConversationRecord => record !== undefined);
  }

  private async readStoredConversation(filePath: string): Promise<StoredConversationRecord | undefined> {
    try {
      const metadata = await stat(filePath);
      if (metadata.size > MAX_CONVERSATION_BYTES) {
        await isolateCorruptHistoryFile(filePath);
        return undefined;
      }
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isConversation(parsed)) {
        await isolateCorruptHistoryFile(filePath);
        return undefined;
      }
      return { conversation: normalizeConversation(parsed), filePath, sizeBytes: metadata.size };
    } catch {
      await isolateCorruptHistoryFile(filePath);
      return undefined;
    }
  }

  private async applyRetentionAndLimits(records: StoredConversationRecord[]): Promise<StoredConversationRecord[]> {
    const retentionDays = SettingsManager.load().historyRetentionDays;
    const threshold = retentionDays === 0 ? 0 : Date.now() - retentionDays * 86_400_000;
    const duplicateIds = findDuplicateConversationIds(records.map((record) => record.conversation));
    const duplicates = records.filter((record) => duplicateIds.has(record.conversation.id));
    const sorted = records.filter((record) => !duplicateIds.has(record.conversation.id)).sort((a, b) => b.conversation.updatedAt - a.conversation.updatedAt);
    const retained: StoredConversationRecord[] = [];
    const removed: StoredConversationRecord[] = [...duplicates];
    let totalBytes = 0;

    for (const record of sorted) {
      const expired = threshold !== 0 && record.conversation.updatedAt < threshold;
      const exceedsLimits = retained.length >= MAX_CONVERSATIONS || totalBytes + record.sizeBytes > MAX_TOTAL_BYTES;
      if (expired || exceedsLimits) {
        removed.push(record);
      } else {
        retained.push(record);
        totalBytes += record.sizeBytes;
      }
    }

    if (removed.length > 0) {
      await Promise.all(removed.map((record) => rm(record.filePath, { force: true })));
    }
    return retained;
  }

  private async waitForPendingMutations(): Promise<void> {
    await this.mutationQueue;
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.then(async () => {
      await withFileLock(getHistoryMutationTarget(), operation);
    }, async () => {
      await withFileLock(getHistoryMutationTarget(), operation);
    });
    this.mutationQueue = next.catch(() => undefined);
    return next;
  }
}

function getHistoryMutationTarget(): string {
  return path.join(getHistoryDirectory(), ".mutations");
}

async function readConversationFile(id: string): Promise<StoredConversationData | undefined> {
  try {
    const filePath = getConversationPath(id);
    if ((await stat(filePath)).size > MAX_CONVERSATION_BYTES) {return undefined;}
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return isConversation(parsed) && parsed.id === id ? normalizeConversation(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function getConversationPath(id: string): string {
  return path.join(getHistoryDirectory(), `${encodeURIComponent(id)}.json`);
}

function toSummary(record: StoredConversationRecord): ConversationSummary {
  const { conversation, sizeBytes } = record;
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    model: conversation.model,
    messageCount: conversation.messages.length,
    sizeBytes,
    workspaceUri: conversation.workspaceUri,
  };
}

async function isolateCorruptHistoryFile(filePath: string): Promise<void> {
  try {
    await mkdir(getCorruptHistoryDirectory(), { recursive: true });
    const target = path.join(getCorruptHistoryDirectory(), `${Date.now()}-${path.basename(filePath)}`);
    await rename(filePath, target);
  } catch {
    await rm(filePath, { force: true }).catch(() => undefined);
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function normalizeConversation(conversation: StoredConversationData): StoredConversationData {
  const messages = conversation.messages.map((message) => {
    const providerTranscript = sanitizeStoredTranscript(message.providerTranscript);
    const completedContext = message.role === "assistant" && providerTranscript?.status === "complete"
      ? message.contextContent ?? getFinalAssistantContent(providerTranscript) ?? message.content ?? ""
      : message.contextContent;
    return {
      ...message,
      content: message.content ?? "",
      toolCalls: message.toolCalls?.map(normalizeToolCall),
      timeline: message.timeline ?? undefined,
      contextContent: completedContext,
      providerTranscript: providerTranscript?.status === "complete" ? undefined : providerTranscript,
    };
  });
  return {
    ...conversation,
    schemaVersion: 2,
    workspaceUri: conversation.workspaceBinding.uri,
    title: createConversationTitle(messages, conversation.title),
    messages,
    contextSummary: isConversationContextSummary(conversation.contextSummary)
      ? structuredClone(conversation.contextSummary)
      : undefined,
  };
}

function normalizeToolCall<T extends NonNullable<Conversation["messages"][number]["toolCalls"]>[number]>(toolCall: T): T {
  if (toolCall.status === "pending" || toolCall.status === "awaiting_confirmation" || toolCall.status === "running") {
    return {
      ...toolCall,
      status: "cancelled",
      result: toolCall.result ?? "Interrupted because the extension host stopped.",
      isError: false,
      requiresConfirmation: false,
      dangerConfirmation: undefined,
    };
  }
  if (toolCall.result && isWebTool(toolCall.toolName) && toolCall.result.length > 8 * 1024) {
    return {
      ...toolCall,
      result: `${toolCall.result.slice(0, 8 * 1024 - 32)}\n[Web result compacted]`,
    };
  }
  return toolCall;
}

function isWebTool(name: string): boolean {
  return ["search_web", "read_web"].includes(name);
}
