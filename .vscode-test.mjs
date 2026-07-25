import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceFolder = dirname(fileURLToPath(import.meta.url));
const testDataDirectory = join(workspaceFolder, '.tmp', 'integration-user-data');
const historyDirectory = join(testDataDirectory, 'history');
const legacyConversationPath = join(historyDirectory, 'legacy-integration.json');

rmSync(testDataDirectory, { recursive: true, force: true });
mkdirSync(historyDirectory, { recursive: true });
writeFileSync(legacyConversationPath, JSON.stringify({
	id: 'legacy-integration',
	title: 'Legacy',
	createdAt: 1,
	updatedAt: 1,
	model: 'deepseek-v4-flash',
	workspaceUri: 'file:///workspace',
	messages: [
		{ id: 'legacy-user', role: 'user', content: 'legacy' },
		{ id: 'legacy-assistant', role: 'assistant', content: 'response', timeline: [], toolCalls: [] },
	],
}), 'utf8');

export default defineConfig({
	files: 'out/test/**/*.test.js',
	workspaceFolder,
	env: {
		NODE_ENV: 'test',
		DEEPSEEK_COPILOT_USER_DATA_DIR: testDataDirectory,
	},
});
