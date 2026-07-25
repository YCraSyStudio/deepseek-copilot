import { defineConfig } from '@vscode/test-cli';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceFolder = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	files: 'out/test/**/*.test.js',
	workspaceFolder,
});
