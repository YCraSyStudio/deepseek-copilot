import * as assert from "node:assert";
import { migrateLegacyConversation } from "@/infrastructure/persistence/LegacyConversationMigration";
import type { WorkspaceBinding } from "@/contracts/messages/WebviewModels";

suite("legacy conversation migration", () => {
  test("upgrades an unversioned conversation and assigns stable generation metadata", () => {
    const legacy = {
      id: "legacy-conversation",
      title: "Legacy",
      createdAt: 1,
      updatedAt: 2,
      model: "deepseek-v4-flash-vision-exp",
      workspaceUri: "file:///workspace",
      messages: [
        { id: "user-1", role: "user", content: "hello" },
        { id: "assistant-1", role: "assistant", content: "done" },
      ],
    };

    const migrated = migrateLegacyConversation(legacy, createBinding);
    assert.strictEqual(migrated?.schemaVersion, 2);
    assert.strictEqual(migrated?.workspaceBinding.uri, legacy.workspaceUri);
    assert.match(migrated?.messages[0]?.generationId ?? "", /^legacy-[a-f0-9]{32}$/);
    assert.strictEqual(migrated?.messages[1]?.generationId, migrated?.messages[0]?.generationId);
    assert.strictEqual(migrated?.messages[1]?.generationStatus, "completed");
  });

  test("does not treat malformed or already-versioned input as legacy", () => {
    const base = {
      id: "legacy-conversation",
      title: "Legacy",
      createdAt: 1,
      updatedAt: 2,
      model: "deepseek-v4-flash-vision-exp",
      workspaceUri: "file:///workspace",
      messages: [],
    };
    assert.strictEqual(migrateLegacyConversation({ ...base, schemaVersion: 2 }, createBinding), undefined);
    assert.strictEqual(migrateLegacyConversation({ ...base, messages: "invalid" }, createBinding), undefined);
  });
});

function createBinding(uri: string): WorkspaceBinding {
  return {
    schemaVersion: 1,
    uri,
    name: "workspace",
    revision: "legacy",
    folders: [],
    capabilities: { files: true, search: true, git: true, terminal: true },
  };
}
