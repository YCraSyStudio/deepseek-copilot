import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceFolder = dirname(fileURLToPath(import.meta.url));
const testDataDirectory = join(workspaceFolder, '.tmp', 'integration-user-data');
const historyDirectory = join(testDataDirectory, 'history');
const invalidConversationPath = join(historyDirectory, 'unversioned-integration.json');
const unsupportedConversationPath = join(historyDirectory, 'unsupported-integration.json');
const malformedConversationPath = join(historyDirectory, 'malformed-integration.json');

rmSync(testDataDirectory, { recursive: true, force: true });
mkdirSync(historyDirectory, { recursive: true });
writeFileSync(invalidConversationPath, JSON.stringify({
	id: 'unversioned-integration',
	title: 'Unversioned',
	createdAt: Date.now(),
	updatedAt: Date.now(),
	model: 'deepseek-v4-flash',
	workspaceUri: 'file:///workspace',
	messages: [
		{ id: 'user', role: 'user', content: 'old data' },
	],
}), 'utf8');
writeFileSync(unsupportedConversationPath, JSON.stringify({ schemaVersion: 3 }), 'utf8');
writeFileSync(malformedConversationPath, '{invalid json', 'utf8');

export default defineConfig({
	files: 'out/test/Extension.test.js',
	workspaceFolder,
	mocha: {
		timeout: 5_000,
	},
	env: {
		NODE_ENV: 'test',
		DEEPSEEK_COPILOT_USER_DATA_DIR: testDataDirectory,
	},
});
