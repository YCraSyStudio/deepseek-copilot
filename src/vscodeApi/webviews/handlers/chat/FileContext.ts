import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compactText, truncateText } from "@/shared/utils";
import {
  captureCurrentWorkspaceBinding,
  captureWorkspaceRunSnapshot,
  type WorkspaceRunSnapshot,
} from "@/vscodeApi/workspace";

const execFileAsync = promisify(execFile);
const AUTO_CONTEXT_BUDGET = 10_000;
const ACTIVE_EDITOR_BUDGET = 4_000;
const GIT_STATUS_BUDGET = 1_500;
const GIT_DIFF_BUDGET = 4_500;

export async function buildAutoContext(
  explicitContextLength = 0,
  workspaceSnapshot = captureWorkspaceRunSnapshot(captureCurrentWorkspaceBinding()),
): Promise<string> {
  const budget = Math.max(0, AUTO_CONTEXT_BUDGET - explicitContextLength);
  if (budget < 500) {
    return "";
  }

  const sections = compactText([
    buildActiveEditorContext(Math.min(ACTIVE_EDITOR_BUDGET, budget), workspaceSnapshot),
    await buildGitContext(Math.max(0, budget - ACTIVE_EDITOR_BUDGET), workspaceSnapshot),
  ]);

  if (sections.length === 0) {
    return "";
  }

  return truncateText(`Auto context:
${sections.join("\n\n")}`, budget);
}

export async function buildGitReviewContext(
  workspaceSnapshot = captureWorkspaceRunSnapshot(captureCurrentWorkspaceBinding()),
): Promise<string> {
  const localFolders = workspaceSnapshot.folders.filter((folder) => folder.localPath);
  if (localFolders.length === 0) {
    return "No workspace folder is open.";
  }

  const sections = compactText(await Promise.all(localFolders.map(async (folder) => {
    const status = await runGit(folder.localPath!, ["status", "--short"], 4_000);
    const diff = await runGit(folder.localPath!, ["diff", "--", "."], 18_000);
    const staged = await runGit(folder.localPath!, ["diff", "--cached", "--", "."], 18_000);
    const content = compactText([
      status ? `Git status:\n\`\`\`\n${status}\n\`\`\`` : "",
      diff ? `Git diff:\n\`\`\`diff\n${diff}\n\`\`\`` : "",
      staged ? `Git staged diff:\n\`\`\`diff\n${staged}\n\`\`\`` : "",
    ]).join("\n\n");
    return content ? `[Workspace root: ${folder.alias}]\n${content}` : "";
  })));
  if (sections.length === 0) {
    return "No current Git changes were detected.";
  }

  return sections.join("\n\n");
}

function buildActiveEditorContext(budget: number, workspaceSnapshot: WorkspaceRunSnapshot): string {
  const editor = workspaceSnapshot.activeEditor;
  if (!editor || budget <= 0) {
    return "";
  }

  return truncateText(`[Active editor: ${editor.workspacePath} (${editor.rangeLabel})]
\`\`\`${getLanguageId(editor.languageId, editor.workspacePath)}
${editor.content}
\`\`\``, budget);
}

async function buildGitContext(budget: number, workspaceSnapshot: WorkspaceRunSnapshot): Promise<string> {
  const localFolders = workspaceSnapshot.folders.filter((folder) => folder.localPath);
  if (localFolders.length === 0 || budget <= 0) {
    return "";
  }

  const perRootBudget = Math.max(300, Math.floor(budget / localFolders.length));
  const sections = compactText(await Promise.all(localFolders.map(async (folder) => {
    const statusBudget = Math.min(GIT_STATUS_BUDGET, Math.floor(perRootBudget / 3));
    const status = await runGit(folder.localPath!, ["status", "--short"], statusBudget);
    const diffBudget = Math.max(0, Math.min(GIT_DIFF_BUDGET, perRootBudget - status.length - 80));
    const diff = diffBudget > 0 ? await runGit(folder.localPath!, ["diff", "--", "."], diffBudget) : "";
    const staged = diffBudget > 0 ? await runGit(folder.localPath!, ["diff", "--cached", "--", "."], diffBudget) : "";
    const content = compactText([
      status ? `[Git status]\n\`\`\`\n${status}\n\`\`\`` : "",
      diff ? `[Git diff]\n\`\`\`diff\n${diff}\n\`\`\`` : "",
      staged ? `[Git staged diff]\n\`\`\`diff\n${staged}\n\`\`\`` : "",
    ]).join("\n\n");
    return content ? `[Workspace root: ${folder.alias}]\n${content}` : "";
  })));

  return truncateText(sections.join("\n\n"), budget);
}

async function runGit(cwd: string, args: string[], budget: number): Promise<string> {
  if (budget <= 0) {
    return "";
  }

  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout: 1500,
      maxBuffer: 200_000,
    });
    return truncateText(stdout.trim(), budget);
  } catch {
    return "";
  }
}

function getLanguageId(languageId: string, path: string): string {
  if (languageId && languageId !== "plaintext") {
    return languageId;
  }
  return path.split(".").pop() || "";
}
