import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import * as path from "node:path";
import type { Conversation, ConversationSummary } from "@/contracts";
import { createConversationTitle } from "@/application/chat/ConversationTitle";
import { findDuplicateConversationIds } from "@/application/chat/ConversationDeduplication";
import { isConversation } from "@/application/chat/ConversationValidation";
import {
  getFinalAssistantContent,
  sanitizeStoredTranscript,
} from "@/application/chat/ProviderTranscript";
import { withFileLock, writeJsonFileAtomic } from "@/infrastructure/persistence/JsonFileStorage";
import { getHistoryDirectory } from "@/infrastructure/persistence/UserDataPaths";
import { captureCurrentWorkspaceBinding } from "@/platform/vscode/workspace";
import type { SettingsRepository } from "@/application/ports";

const MAX_CONVERSATIONS = 100;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_CONVERSATION_BYTES = 64 * 1024 * 1024;
const MAX_SEGMENT_BYTES = 4 * 1024 * 1024;
const SEGMENT_STORAGE_SCHEMA_VERSION = 1;

interface SegmentedConversationManifest {
  storageSchemaVersion: typeof SEGMENT_STORAGE_SCHEMA_VERSION;
  conversation: Omit<StoredConversationData, "messages">;
  chunks: string[];
}

interface StoredConversationRecord {
  conversation: StoredConversationData;
  filePath: string;
  sizeBytes: number;
}

type StoredConversationData = import("@/application/chat/ProviderTranscript").StoredConversation;

export class HistoryManager {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly settings: SettingsRepository) {}

  async initialize(): Promise<void> {
    await withFileLock(getHistoryMutationTarget(), async () => {
      await rm(path.join(getHistoryDirectory(), "corrupt"), { recursive: true, force: true });
      await this.readAll();
    });
  }

  getWorkspaceBinding() {
    return captureCurrentWorkspaceBinding();
  }

  async getSummaries(): Promise<ConversationSummary[]> {
    if (!this.settings.load().historyEnabled) {return [];}
    await this.waitForPendingMutations();
    return withFileLock(getHistoryMutationTarget(), async () => {
      const records = await this.readAll();
      const retained = await this.applyRetentionAndLimits(records);
      return retained.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  async save(conversation: StoredConversationData): Promise<void> {
    if (!this.settings.load().historyEnabled) {return;}
    if (!isConversation(conversation)) {
      throw new Error("Refusing to persist an incompatible conversation");
    }
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
      await writeConversationStorage(normalized);
      await this.applyRetentionAndLimits(await this.readAll(), new Set([normalized.id]));
    });
  }

  async delete(id: string, expectedUpdatedAt?: number): Promise<boolean> {
    const deleted = await this.deleteMany([{ id, expectedUpdatedAt }]);
    return deleted.includes(id);
  }

  async deleteMany(entries: Array<string | { id: string; expectedUpdatedAt?: number }>): Promise<string[]> {
    if (!this.settings.load().historyEnabled) {return [];}
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
        await deleteConversationStorage(entry.id);
        deleted.push(entry.id);
      }
    });
    return deleted;
  }

  async saveIfAbsent(conversation: StoredConversationData): Promise<boolean> {
    if (!this.settings.load().historyEnabled) {return false;}
    if (!isConversation(conversation)) {
      throw new Error("Refusing to persist an incompatible conversation");
    }
    const normalized = normalizeConversation(conversation);
    if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAX_CONVERSATION_BYTES) {
      throw new Error("Conversation is too large to save safely. Reduce its retained context before continuing.");
    }
    let saved = false;
    await this.enqueueMutation(async () => {
      if (await readConversationFile(conversation.id)) {return;}
      await writeConversationStorage(normalized);
      saved = true;
    });
    return saved;
  }

  async getById(id: string): Promise<StoredConversationData | undefined> {
    if (!this.settings.load().historyEnabled) {return undefined;}
    await this.waitForPendingMutations();
    const filePath = getConversationPath(id);
    try {
      const metadata = await stat(filePath);
      if (metadata.size > MAX_CONVERSATION_BYTES) {
        await deleteIncompatibleHistoryFile(filePath);
        return undefined;
      }
      const parsed = await readConversationStorage(filePath);
      if (!parsed || parsed.id !== id) {
        await deleteIncompatibleHistoryFile(filePath);
        return undefined;
      }
      return normalizeConversation(parsed);
    } catch (error) {
      if (isFileNotFoundError(error)) {return undefined;}
      await deleteIncompatibleHistoryFile(filePath);
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
        await deleteIncompatibleHistoryFile(filePath);
        return undefined;
      }
      const parsed = await readConversationStorage(filePath);
      if (!parsed || path.resolve(filePath) !== path.resolve(getConversationPath(parsed.id))) {
        await deleteIncompatibleHistoryFile(filePath);
        return undefined;
      }
      return { conversation: normalizeConversation(parsed), filePath, sizeBytes: Buffer.byteLength(JSON.stringify(parsed), "utf8") };
    } catch {
      await deleteIncompatibleHistoryFile(filePath);
      return undefined;
    }
  }

  private async applyRetentionAndLimits(records: StoredConversationRecord[], protectedIds: ReadonlySet<string> = new Set()): Promise<StoredConversationRecord[]> {
    const retentionDays = this.settings.load().historyRetentionDays;
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
      if ((expired || exceedsLimits) && !protectedIds.has(record.conversation.id)) {
        removed.push(record);
      } else {
        retained.push(record);
        totalBytes += record.sizeBytes;
      }
    }

    if (removed.length > 0) {
      await Promise.all(removed.map((record) => deleteConversationStorage(record.conversation.id)));
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
  const filePath = getConversationPath(id);
  try {
    if ((await stat(filePath)).size > MAX_CONVERSATION_BYTES) {
      await deleteIncompatibleHistoryFile(filePath);
      return undefined;
    }
    const parsed = await readConversationStorage(filePath);
    if (!parsed || parsed.id !== id) {
      await deleteIncompatibleHistoryFile(filePath);
      return undefined;
    }
    return normalizeConversation(parsed);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      await deleteIncompatibleHistoryFile(filePath);
    }
    return undefined;
  }
}

async function writeConversationStorage(conversation: StoredConversationData): Promise<void> {
  const filePath = getConversationPath(conversation.id);
  if (Buffer.byteLength(JSON.stringify(conversation), "utf8") <= MAX_SEGMENT_BYTES) {
    await writeJsonFileAtomic(filePath, conversation);
    await removeConversationSegments(conversation.id);
    return;
  }

  const generation = `${encodeURIComponent(conversation.id)}-${conversation.updatedAt}`;
  const segmentDirectory = path.join(getHistoryDirectory(), ".segments", generation);
  await mkdir(segmentDirectory, { recursive: true });
  const chunks = chunkConversationMessages(conversation.messages);
  const chunkPaths: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const relative = path.posix.join(".segments", generation, `${String(index).padStart(5, "0")}.json`);
    await writeJsonFileAtomic(path.join(getHistoryDirectory(), ...relative.split("/")), chunks[index]);
    chunkPaths.push(relative);
  }
  const { messages: _messages, ...metadata } = conversation;
  const manifest: SegmentedConversationManifest = {
    storageSchemaVersion: SEGMENT_STORAGE_SCHEMA_VERSION,
    conversation: metadata,
    chunks: chunkPaths,
  };
  // The manifest is the commit point: until it is replaced, readers keep using
  // the previous complete monolithic file or segment generation.
  await writeJsonFileAtomic(filePath, manifest);
  await removeConversationSegments(conversation.id, generation);
}

function chunkConversationMessages(messages: StoredConversationData["messages"]): StoredConversationData["messages"][] {
  const chunks: StoredConversationData["messages"][] = [];
  let current: StoredConversationData["messages"] = [];
  let currentBytes = 2;
  for (const message of messages) {
    const bytes = Buffer.byteLength(JSON.stringify(message), "utf8") + 1;
    if (current.length > 0 && currentBytes + bytes > MAX_SEGMENT_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(message);
    currentBytes += bytes;
  }
  if (current.length > 0) {chunks.push(current);}
  return chunks;
}

async function readConversationStorage(filePath: string): Promise<StoredConversationData | undefined> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (isConversation(parsed)) {return parsed;}
  if (!isSegmentedManifest(parsed)) {return undefined;}
  const messages: StoredConversationData["messages"] = [];
  for (const relative of parsed.chunks) {
    const chunkPath = path.resolve(getHistoryDirectory(), ...relative.split("/"));
    const segmentRoot = path.resolve(getHistoryDirectory(), ".segments");
    if (!chunkPath.startsWith(`${segmentRoot}${path.sep}`)) {return undefined;}
    const metadata = await stat(chunkPath);
    if (metadata.size > MAX_SEGMENT_BYTES + 1024 * 1024) {return undefined;}
    const chunk = JSON.parse(await readFile(chunkPath, "utf8")) as unknown;
    if (!Array.isArray(chunk)) {return undefined;}
    messages.push(...chunk as StoredConversationData["messages"]);
  }
  const conversation = { ...parsed.conversation, messages };
  return isConversation(conversation) ? conversation : undefined;
}

function isSegmentedManifest(value: unknown): value is SegmentedConversationManifest {
  if (!value || typeof value !== "object") {return false;}
  const manifest = value as Partial<SegmentedConversationManifest>;
  return manifest.storageSchemaVersion === SEGMENT_STORAGE_SCHEMA_VERSION &&
    !!manifest.conversation && typeof manifest.conversation === "object" &&
    Array.isArray(manifest.chunks) && manifest.chunks.length <= 10_000 &&
    manifest.chunks.every((chunk) => typeof chunk === "string" && /^\.segments\/[a-zA-Z0-9%_.~-]+\/\d{5}\.json$/.test(chunk));
}

async function deleteConversationStorage(id: string): Promise<void> {
  await rm(getConversationPath(id), { force: true });
  await removeConversationSegments(id);
}

async function removeConversationSegments(id: string, keepGeneration?: string): Promise<void> {
  await removeConversationSegmentsByEncodedId(encodeURIComponent(id), keepGeneration);
}

async function removeConversationSegmentsByEncodedId(encodedId: string, keepGeneration?: string): Promise<void> {
  const root = path.join(getHistoryDirectory(), ".segments");
  const prefix = `${encodedId}-`;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix) && entry.name !== keepGeneration)
    .map((entry) => rm(path.join(root, entry.name), { recursive: true, force: true })));
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

async function deleteIncompatibleHistoryFile(filePath: string): Promise<void> {
  const encodedId = path.basename(filePath, path.extname(filePath));
  await rm(filePath, { force: true }).catch(() => undefined);
  await removeConversationSegmentsByEncodedId(encodedId);
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
      content: message.content,
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
    contextSummary: conversation.contextSummary
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
