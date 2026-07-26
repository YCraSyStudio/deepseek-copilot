import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Conversation, ConversationSummary } from "@/adapters";
import { createConversationTitle } from "@/core/chat/ConversationTitle";
import { findDuplicateConversationIds } from "@/core/chat/ConversationDeduplication";
import { isConversation } from "@/core/chat/ConversationValidation";
import { isConversationContextSummary, sanitizeStoredTranscript } from "@/core/chat/ProviderTranscript";
import { CONVERSATION_STORAGE_KEY } from "@/shared/constants";
import { SettingsManager } from "./SettingsManager";
import { writeJsonFileAtomic } from "./JsonFileStorage";
import { getCorruptHistoryDirectory, getHistoryDirectory } from "./UserDataPaths";
import { captureCurrentWorkspaceBinding, createLegacyWorkspaceBinding } from "@/vscodeApi/workspace";

const MAX_CONVERSATIONS = 100;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

interface StoredConversationRecord {
  conversation: StoredConversationData;
  filePath: string;
  sizeBytes: number;
}

type StoredConversationData = import("@/core/chat/ProviderTranscript").StoredConversation;

export class HistoryManager {
  private readonly legacyHistoryCleared: Promise<void>;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.legacyHistoryCleared = initializeLegacyHistory(context.workspaceState);
  }

  async initialize(): Promise<void> {
    await this.legacyHistoryCleared;
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
    const records = await this.readAll();
    const retained = await this.applyRetentionAndLimits(records);
    return retained.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(conversation: StoredConversationData): Promise<void> {
    if (!SettingsManager.load().historyEnabled) {return;}
    const normalized = normalizeConversation(conversation);
    await this.enqueueMutation(async () => {
      await writeJsonFileAtomic(getConversationPath(normalized.id), normalized);
      await this.applyRetentionAndLimits(await this.readAll());
    });
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    await this.enqueueMutation(() => Promise.all(uniqueIds.map((id) => rm(getConversationPath(id), { force: true }))).then(() => undefined));
  }

  async getById(id: string): Promise<StoredConversationData | undefined> {
    await this.waitForPendingMutations();
    const filePath = getConversationPath(id);
    try {
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
    await this.legacyHistoryCleared;
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
      const [raw, metadata] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
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
    await this.legacyHistoryCleared;
    await this.mutationQueue;
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const next = this.mutationQueue.then(async () => {
      await this.legacyHistoryCleared;
      await operation();
    }, async () => {
      await this.legacyHistoryCleared;
      await operation();
    });
    this.mutationQueue = next.catch(() => undefined);
    return next;
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

async function clearLegacyWorkspaceHistory(workspaceState: vscode.Memento): Promise<void> {
  const keys = workspaceState.keys().filter((key) => key.startsWith(CONVERSATION_STORAGE_KEY));
  const bodyPrefix = `${CONVERSATION_STORAGE_KEY}.body.`;
  for (const key of keys.filter((candidate) => candidate.startsWith(bodyPrefix))) {
    const stored = workspaceState.get<unknown>(key);
    const envelope = stored && typeof stored === "object" ? stored as { schemaVersion?: unknown; conversation?: unknown } : undefined;
    if (envelope?.schemaVersion === 1 && isConversation(envelope.conversation)) {
      try {
        const migrated = migrateLegacyConversation(envelope.conversation);
        const target = getConversationPath(migrated.id);
        await writeJsonFileAtomic(target, migrated);
        const verified = JSON.parse(await readFile(target, "utf8")) as unknown;
        if (!isConversation(verified) || verified.schemaVersion !== 2 || verified.id !== migrated.id) {
          continue;
        }
      } catch {
        continue;
      }
    }
    await workspaceState.update(key, undefined);
  }
  await Promise.all(keys.filter((key) => !key.startsWith(bodyPrefix)).map((key) => workspaceState.update(key, undefined)));
}

async function initializeLegacyHistory(workspaceState: vscode.Memento): Promise<void> {
  await clearLegacyWorkspaceHistory(workspaceState);
  await mkdir(getHistoryDirectory(), { recursive: true });
  const entries = await readdir(getHistoryDirectory(), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(getHistoryDirectory(), entry.name);
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      if (!isConversation(parsed) || !needsLegacyConversationMigration(parsed)) {
        continue;
      }
      await writeJsonFileAtomic(filePath, migrateLegacyConversation(parsed));
      const verified = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      if (!isConversation(verified) || verified.schemaVersion !== 2) {
        throw new Error("Conversation migration verification failed");
      }
    } catch {
      // The normal history reader will isolate malformed data without blocking activation.
    }
  }
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
  const messages = conversation.messages.map((message) => ({
    ...message,
    content: message.content ?? "",
    toolCalls: message.toolCalls?.map(normalizeToolCall),
    timeline: message.timeline ?? undefined,
    providerTranscript: sanitizeStoredTranscript(message.providerTranscript),
  }));
  const workspaceBinding = conversation.workspaceBinding ?? createLegacyWorkspaceBinding(conversation.workspaceUri);
  return {
    ...conversation,
    schemaVersion: 2,
    workspaceUri: workspaceBinding.uri,
    workspaceBinding,
    title: createConversationTitle(messages, conversation.title),
    messages,
    contextSummary: isConversationContextSummary(conversation.contextSummary)
      ? structuredClone(conversation.contextSummary)
      : undefined,
  };
}

function needsLegacyConversationMigration(conversation: StoredConversationData): boolean {
  if (conversation.schemaVersion !== 2) {
    return true;
  }
  if (!conversation.workspaceBinding) {
    return true;
  }
  return conversation.messages.some((message) =>
    (message.role === "user" || message.role === "assistant" || message.role === "error") &&
    (!message.generationId || ((message.role === "assistant" || message.role === "error") && !message.generationStatus)),
  );
}

function migrateLegacyConversation(conversation: StoredConversationData): StoredConversationData {
  let currentGenerationId: string | undefined;
  const messages = conversation.messages.map((message, index) => {
    if (message.role === "user") {
      currentGenerationId = message.generationId ?? createLegacyGenerationId(conversation.id, message.id, index);
      return { ...message, generationId: currentGenerationId };
    }

    if (message.role === "assistant" || message.role === "error") {
      currentGenerationId = message.generationId ?? currentGenerationId ?? createLegacyGenerationId(conversation.id, message.id, index);
      return {
        ...message,
        generationId: currentGenerationId,
        generationStatus: message.generationStatus ?? (message.role === "error" ? "error" : "completed"),
      };
    }

    return currentGenerationId && !message.generationId ? { ...message, generationId: currentGenerationId } : message;
  });
  const workspaceBinding = conversation.workspaceBinding ?? createLegacyWorkspaceBinding(conversation.workspaceUri);
  return normalizeConversation({ ...conversation, schemaVersion: 2, workspaceUri: workspaceBinding.uri, workspaceBinding, messages });
}

function createLegacyGenerationId(conversationId: string, messageId: string, index: number): string {
  const digest = createHash("sha256").update(`${conversationId}\0${messageId}\0${index}`).digest("hex").slice(0, 32);
  return `legacy-${digest}`;
}

function normalizeToolCall<T extends NonNullable<Conversation["messages"][number]["toolCalls"]>[number]>(toolCall: T): T {
  if (toolCall.status === "pending" || toolCall.status === "awaiting_confirmation" || toolCall.status === "running") {
    return {
      ...toolCall,
      status: "cancelled",
      result: toolCall.result ?? "Interrupted because the extension host stopped.",
      isError: false,
      requiresConfirmation: false,
    };
  }
  return toolCall;
}
