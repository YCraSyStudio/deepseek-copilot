import type { AppConfig, PermissionSnapshot } from "@/contracts/Config";
import type { ConversationSummary } from "@/contracts/messages/WebviewModels";
import type { StoredConversation } from "@/application/chat/ProviderTranscript";

export interface ConversationRepository {
  initialize(): Promise<void>;
  getSummaries(): Promise<ConversationSummary[]>;
  getById(id: string): Promise<StoredConversation | undefined>;
  save(conversation: StoredConversation): Promise<void>;
  saveIfAbsent(conversation: StoredConversation): Promise<boolean>;
  delete(id: string, expectedUpdatedAt?: number): Promise<boolean>;
  deleteMany(entries: Array<string | { id: string; expectedUpdatedAt?: number }>): Promise<string[]>;
}

export interface SettingsRepository {
  load(): AppConfig;
  save(patch: Partial<AppConfig>): Promise<void>;
  reset(): Promise<void>;
  getRevision(): number;
  waitForPendingWrites(): Promise<void>;
  capturePermissionSnapshot(workspaceTrusted: boolean): Promise<PermissionSnapshot>;
  getPersistenceError(): string | undefined;
  enterDegradedMode(error: unknown): void;
}

export interface SecretStore {
  migrateLegacyApiKey(baseUrl: string): Promise<void>;
  getApiKey(baseUrl: string): Promise<string | undefined>;
  setApiKey(baseUrl: string, apiKey: string): Promise<void>;
  deleteApiKey(baseUrl: string): Promise<void>;
}

export interface CheckpointRepository<TCheckpoint> {
  save(checkpoint: TCheckpoint): Promise<TCheckpoint>;
  delete(generationId: string): Promise<void>;
  list(): Promise<TCheckpoint[]>;
}
