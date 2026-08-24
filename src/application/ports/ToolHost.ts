export type ToolWorkspaceEntryType = "file" | "directory" | "unknown";

export interface ToolWorkspaceStat { type: ToolWorkspaceEntryType; size: number; }
export interface ToolWorkspaceFindOptions { includePattern: string; maxResults: number; signal?: AbortSignal; }
export interface ToolWorkspaceFilePreview { head: Uint8Array; tail?: Uint8Array; size: number; }
export interface ResolvedWorkspacePath { absolutePath: string; relativePath: string; workspaceRoot?: string; }
export interface ResolveWorkspacePathOptions { allowSensitive?: boolean; }
export type RealPathResolver = (absolutePath: string) => Promise<string>;

export interface ToolHostCommandOptions {
  cwd: string;
  workspaceRoot: string;
  signal?: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface ToolHostCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  durationMs: number;
  truncated: { stdout: boolean; stderr: boolean };
  terminationConfirmed?: boolean;
  shell?: string;
}

export interface ToolHost {
  getRootPath(): string | undefined;
  getWorkspaceId?(): string;
  getAvailableRootAliases?(): string[];
  getDefaultRootAlias?(): string | undefined;
  isPathInsideWorkspace?(path: string): Promise<boolean>;
  resolvePath?(path: string, allowSensitive: boolean): Promise<string>;
  resolveLocalPath?(path?: string): Promise<ResolvedWorkspacePath>;
  getCommandShell?(): string;
  executeCommand?(command: string, options: ToolHostCommandOptions): Promise<ToolHostCommandResult>;
  realPath?(absolutePath: string): Promise<string>;
  findFiles?(options: ToolWorkspaceFindOptions): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  readFilePreview?(path: string, maxBytes: number): Promise<ToolWorkspaceFilePreview>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
  stat(path: string): Promise<ToolWorkspaceStat>;
  createParentDirectory(path: string): Promise<void>;
  readDirectory(path: string): Promise<Array<[string, ToolWorkspaceEntryType]>>;
  prepareFileDiff?(path: string, before: string, after: string): Promise<void>;
  clearFileDiffPreview?(): void;
}

/** Compatibility name while tool adapters migrate to the shorter port name. */
export type ToolWorkspaceHost = ToolHost;
