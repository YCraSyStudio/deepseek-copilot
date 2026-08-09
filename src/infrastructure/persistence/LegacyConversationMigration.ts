import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import type * as vscode from "vscode";
import type { WorkspaceBinding } from "@/adapters/messages/WebviewModels";
import { isConversation } from "@/core/chat/ConversationValidation";
import type { StoredConversation } from "@/core/chat/ProviderTranscript";
import { CONVERSATION_STORAGE_KEY } from "@/shared/constants";
import { writeJsonFileAtomic } from "@/vscodeApi/storage/JsonFileStorage";

export interface LegacyConversationMigrationDependencies {
  historyDirectory: string;
  workspaceState: vscode.Memento;
  createWorkspaceBinding: (workspaceUri: string) => WorkspaceBinding;
}

export interface LegacyConversationMigrationResult {
  migratedFiles: number;
  migratedWorkspaceEntries: number;
}

/**
 * Temporary compatibility boundary tracked by issue #61. Domain code only
 * accepts schema v2; legacy input is admitted and rewritten here.
 */
export async function migrateLegacyConversations(
  dependencies: LegacyConversationMigrationDependencies,
): Promise<LegacyConversationMigrationResult> {
  await mkdir(dependencies.historyDirectory, { recursive: true });
  const migratedWorkspaceEntries = await migrateWorkspaceState(dependencies);
  let migratedFiles = 0;

  for (const entry of await readdir(dependencies.historyDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(dependencies.historyDirectory, entry.name);
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      if (isConversation(parsed)) {
        continue;
      }
      const migrated = migrateLegacyConversation(parsed, dependencies.createWorkspaceBinding);
      if (!migrated) {
        continue;
      }
      await writeAndVerify(filePath, migrated);
      migratedFiles += 1;
    } catch {
      // The normal repository reader isolates malformed files. Migration must
      // never make extension activation unavailable.
    }
  }

  return { migratedFiles, migratedWorkspaceEntries };
}

export function migrateLegacyConversation(
  value: unknown,
  createWorkspaceBinding: (workspaceUri: string) => WorkspaceBinding,
): StoredConversation | undefined {
  if (!isLegacyConversationShape(value)) {
    return undefined;
  }

  const workspaceBinding = createWorkspaceBinding(value.workspaceUri);
  let currentGenerationId: string | undefined;
  const messages = value.messages.map((message, index) => {
    const migrated = { ...message, content: message.content ?? "" };
    if (message.role === "user") {
      currentGenerationId = getString(message.generationId) ?? createLegacyGenerationId(value.id, message.id, index);
      return { ...migrated, generationId: currentGenerationId };
    }
    if (message.role === "assistant" || message.role === "error") {
      currentGenerationId = getString(message.generationId) ?? currentGenerationId ??
        createLegacyGenerationId(value.id, message.id, index);
      return {
        ...migrated,
        generationId: currentGenerationId,
        generationStatus: message.generationStatus ?? (message.role === "error" ? "error" : "completed"),
      };
    }
    return currentGenerationId && !message.generationId
      ? { ...migrated, generationId: currentGenerationId }
      : migrated;
  });

  const candidate = {
    ...value,
    schemaVersion: 2,
    workspaceUri: workspaceBinding.uri,
    workspaceBinding,
    messages,
  };
  return isConversation(candidate) ? structuredClone(candidate) : undefined;
}

async function migrateWorkspaceState(
  dependencies: LegacyConversationMigrationDependencies,
): Promise<number> {
  const keys = dependencies.workspaceState.keys().filter((key) => key.startsWith(CONVERSATION_STORAGE_KEY));
  const bodyPrefix = `${CONVERSATION_STORAGE_KEY}.body.`;
  let migratedCount = 0;

  for (const key of keys.filter((candidate) => candidate.startsWith(bodyPrefix))) {
    const stored = dependencies.workspaceState.get<unknown>(key);
    const envelope = isRecord(stored) && stored.schemaVersion === 1 ? stored : undefined;
    const migrated = migrateLegacyConversation(envelope?.conversation, dependencies.createWorkspaceBinding);
    if (migrated) {
      try {
        const target = path.join(dependencies.historyDirectory, `${encodeURIComponent(migrated.id)}.json`);
        await writeAndVerify(target, migrated);
        await dependencies.workspaceState.update(key, undefined);
        migratedCount += 1;
      } catch {
        continue;
      }
    }
  }

  await Promise.all(
    keys
      .filter((key) => !key.startsWith(bodyPrefix))
      .map((key) => dependencies.workspaceState.update(key, undefined)),
  );
  return migratedCount;
}

async function writeAndVerify(filePath: string, conversation: StoredConversation): Promise<void> {
  await writeJsonFileAtomic(filePath, conversation);
  const verified = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isConversation(verified) || verified.id !== conversation.id || verified.schemaVersion !== 2) {
    throw new Error("Conversation migration verification failed");
  }
}

function isLegacyConversationShape(value: unknown): value is LegacyConversationShape {
  if (!isRecord(value) || value.schemaVersion !== undefined) {
    return false;
  }
  return isBoundedString(value.id, 512) &&
    isBoundedString(value.title, 4096) &&
    isBoundedString(value.model, 256) &&
    isBoundedString(value.workspaceUri, 32_768) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    Array.isArray(value.messages) &&
    value.messages.length <= 10_000 &&
    value.messages.every(isLegacyMessage);
}

function isLegacyMessage(value: unknown): value is LegacyMessage {
  return isRecord(value) &&
    isBoundedString(value.id, 512) &&
    (value.role === "user" || value.role === "assistant" || value.role === "error" || value.role === "tool") &&
    (value.content === undefined || isBoundedString(value.content, 5 * 1024 * 1024));
}

function createLegacyGenerationId(conversationId: string, messageId: string, index: number): string {
  const digest = createHash("sha256").update(`${conversationId}\0${messageId}\0${index}`).digest("hex").slice(0, 32);
  return `legacy-${digest}`;
}

interface LegacyConversationShape extends Record<string, unknown> {
  id: string;
  title: string;
  model: string;
  workspaceUri: string;
  createdAt: number;
  updatedAt: number;
  messages: LegacyMessage[];
}

interface LegacyMessage extends Record<string, unknown> {
  id: string;
  role: "user" | "assistant" | "error" | "tool";
  content?: string;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
