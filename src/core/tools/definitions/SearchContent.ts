import type { ToolDefinition } from "@/adapters";
import type { RegisteredTool, ToolHandlerContext, ToolMetadata } from "../Types";
import { getToolWorkspaceHost, type ToolWorkspaceHost } from "../ToolWorkspace";
import { bufferLooksBinary, createStructuredResult } from "./StructuredResult";

const MAX_SEARCH_RESULTS = 50;
const MAX_CANDIDATE_FILES = 10_000;
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 256 * 1024;
const MAX_QUERY_CHARACTERS = 4096;
const MAX_PATTERN_CHARACTERS = 1024;
const MAX_RESULT_LINE_CHARACTERS = 2000;
const SEARCH_TIMEOUT_MS = 15_000;

interface SearchResult {
  file: string;
  line: number;
  text: string;
}

async function handleSearchContent(args: Record<string, unknown>, context?: ToolHandlerContext): Promise<string> {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query.trim()) {
    throw new Error("query parameter is required");
  }
  if (query.length > MAX_QUERY_CHARACTERS) {
    throw new Error(`query must not exceed ${MAX_QUERY_CHARACTERS} characters`);
  }

  const includePattern = normalizeFilePattern(args.filePattern);
  const workspace = getToolWorkspaceHost();
  if (!workspace.getRootPath()) {
    throw new Error("No workspace folder open");
  }
  if (!workspace.findFiles) {
    throw new Error("Workspace content search is unavailable in this environment");
  }

  const cancellation = createSearchCancellation(context?.signal);
  try {
    const candidatePaths = await workspace.findFiles({
      includePattern,
      maxResults: MAX_CANDIDATE_FILES + 1,
      signal: cancellation.signal,
    });
    throwIfAborted(cancellation.signal);
    return await searchCandidateFiles({
      workspace,
      candidatePaths,
      query,
      includePattern,
      signal: cancellation.signal,
    });
  } catch (error: unknown) {
    if (context?.signal?.aborted) {
      throw createAbortError("Content search cancelled");
    }
    if (cancellation.didTimeOut()) {
      throw new Error(`Content search timed out after ${SEARCH_TIMEOUT_MS} ms`);
    }
    if (isAbortError(error)) {
      throw error;
    }
    throw new Error(`Content search failed: ${getErrorMessage(error)}`, { cause: error });
  } finally {
    cancellation.dispose();
  }
}

async function searchCandidateFiles(options: {
  workspace: ToolWorkspaceHost;
  candidatePaths: string[];
  query: string;
  includePattern: string;
  signal: AbortSignal;
}): Promise<string> {
  const { workspace, query, includePattern, signal } = options;
  const candidatePaths = options.candidatePaths.slice(0, MAX_CANDIDATE_FILES);
  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];
  let retainedBytes = Buffer.byteLength(query, "utf8") + Buffer.byteLength(includePattern, "utf8");
  let scannedFiles = 0;
  let skippedFiles = 0;
  let truncated = options.candidatePaths.length > candidatePaths.length;

  searchLoop:
  for (const filePath of candidatePaths) {
    throwIfAborted(signal);

    try {
      const stat = await workspace.stat(filePath);
      if (stat.type !== "file") {
        continue;
      }
      if (stat.size > MAX_SEARCH_FILE_BYTES) {
        skippedFiles += 1;
        truncated = true;
        continue;
      }

      const content = await workspace.readFile(filePath);
      if (content.byteLength > MAX_SEARCH_FILE_BYTES) {
        skippedFiles += 1;
        truncated = true;
        continue;
      }
      scannedFiles += 1;
      if (bufferLooksBinary(content)) {
        skippedFiles += 1;
        continue;
      }

      const lines = Buffer.from(content).toString("utf8").split(/\r\n|\n|\r/);
      for (let index = 0; index < lines.length; index += 1) {
        throwIfAborted(signal);
        const line = lines[index];
        if (!line.toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        if (results.length >= MAX_SEARCH_RESULTS) {
          truncated = true;
          break searchLoop;
        }

        const preview = truncateResultLine(line.trim());
        const result = { file: filePath, line: index + 1, text: preview.text };
        const resultBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
        if (retainedBytes + resultBytes > MAX_SEARCH_OUTPUT_BYTES) {
          truncated = true;
          break searchLoop;
        }

        results.push(result);
        retainedBytes += resultBytes;
        truncated ||= preview.truncated;
      }
    } catch (error: unknown) {
      if (isAbortError(error) || signal.aborted) {
        throw createAbortError("Content search cancelled");
      }
      skippedFiles += 1;
      truncated = true;
    }
  }

  return createStructuredResult("SearchResults", {
    query,
    filePattern: includePattern,
    results,
    truncated,
    scannedFiles,
    skippedFiles,
  });
}

function normalizeFilePattern(value: unknown): string {
  if (value === undefined) {
    return "**/*";
  }
  if (typeof value !== "string") {
    throw new Error("filePattern must be a string");
  }

  const pattern = value.trim().replace(/\\/g, "/");
  if (!pattern) {
    return "**/*";
  }
  if (pattern.length > MAX_PATTERN_CHARACTERS) {
    throw new Error(`filePattern must not exceed ${MAX_PATTERN_CHARACTERS} characters`);
  }
  if (pattern.includes("\0")) {
    throw new Error("filePattern contains an invalid null byte");
  }
  if (pattern.startsWith("/") || /^[a-zA-Z]:\//.test(pattern) || pattern.split("/").includes("..")) {
    throw new Error("filePattern must stay inside the workspace");
  }
  return pattern.includes("/") ? pattern : `**/${pattern}`;
}

function truncateResultLine(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_RESULT_LINE_CHARACTERS) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, MAX_RESULT_LINE_CHARACTERS - 1)}…`,
    truncated: true,
  };
}

function createSearchCancellation(parentSignal: AbortSignal | undefined): {
  signal: AbortSignal;
  didTimeOut(): boolean;
  dispose(): void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SEARCH_TIMEOUT_MS);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError("Content search cancelled");
  }
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "Canceled");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const searchContentDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "search_content",
    description: "Search for literal text in project files. Returns file, line, and matching content.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Literal text to search for, matched case-insensitively.",
        },
        filePattern: {
          type: "string",
          description: "Optional workspace-relative glob filter, for example *.ts or src/**/*.md.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

export const searchContentHandler: RegisteredTool["handler"] = handleSearchContent;

export const searchContentMetadata: ToolMetadata = {
  dangerLevel: "safe",
  requiresConfirmation: false,
};
