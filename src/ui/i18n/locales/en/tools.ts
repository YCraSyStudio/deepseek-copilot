import type { TranslationCatalog } from "../Types";

export const tools = {
  tools: {
    permissionMode: "Permission mode",
    savedGloballyForAllWorkspaces: "Saved globally for all workspaces.",
    toolPermissions: "Tool permissions",
    noToolsAreAvailable: "No tools are available.",
    noToolsTheModelCanOnlyAnswerInChat: "No tools. The model can only answer in chat.",
    readOnlyDescription: "Read files, list directories, and search workspace content.",
    fullAccessDescription: "All enabled tools execute immediately, including terminal commands, without confirmation prompts.",
    chat: "Chat",
    readOnly: "Read only",
    fullAccess: "Full access",
    disabled: "Disabled",
    enabled: "Enabled",
    autoApprove: "Auto approve",
    autoApproveModeDescription: "Non-terminal tools may execute immediately. Terminal commands run automatically only when proven read-only and contained in the workspace.",
    autoApproveWarning: "Enable global auto approve? Non-terminal tools may execute immediately. The terminal is not OS-sandboxed, and commands that are not proven read-only and workspace-contained will still require confirmation.",
    blockedByModePermissionMode: "Blocked by {mode} permission mode",
    nameMode: "{name} mode",
    toolCalls: "Tool calls",
    toolCall: "Tool call",
    pending: "Pending",
    awaitingConfirmation: "Awaiting confirmation",
    running: "Running",
    completed: "Completed",
    error: "Error",
    rejected: "Rejected",
    cancelled: "Cancelled",
    copyCall: "Copy call",
    copyToolData: "Copy {tool} data",
    copy: "Copy",
    insert: "Insert",
    copyArguments: "Copy arguments",
    copyResult: "Copy result",
    labelCopied: "{label} copied."
  }
} satisfies TranslationCatalog;
