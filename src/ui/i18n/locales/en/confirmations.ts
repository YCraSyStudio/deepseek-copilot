import type { TranslationCatalog } from "../Types";

export const confirmations = {
  confirmations: {
    reviewDetails: "Review details",
    reviewTool: "Review {tool}",
    reviewFileDescription: "Review the complete operation for {path} before choosing an action.",
    reviewToolDescription: "Review this {tool} operation before choosing an action.",
    completeArgumentsForTool: "Complete arguments for {tool}",
    roundRound: "Round {round}",
    openFileInEditor: "Open file in editor",
    filePath: "File: {path}",
    reviewBeforeExecuting: "Review before executing.",
    executeOnce: "Execute once",
    reject: "Reject",
    executeAllManualToolsOnce: "Execute all manual tools once",
    rejectAllManualTools: "Reject all manual tools",
    completeCommand: "Complete command",
    workingDirectory: "Working directory:",
    shell: "Shell:",
    trustMatchingOperationsThisSession: "Trust this operation for this conversation",
    cancel: "Cancel",
    yesExecuteOnce: "Yes, execute once",
    destructiveOnceDescription: "This destructive operation is approved once only. Destructive actions always require a separate confirmation.",
    sessionTrustDescription: "Execute once approves only this operation. Trust for this conversation approves the exact matching operation only in this workspace and configuration.",
    destructiveAction: "Destructive Action",
    potentiallyDangerousAction: "Potentially Dangerous Action",
    cautionRequired: "Caution Required",
    toolCallLimitReached: "Tool call limit reached",
    toolCallLimitDescription: "The assistant has completed {rounds} tool rounds. Continue with up to {batchSize} more rounds?",
    continueToolCalls: "Continue",
    stopToolCalls: "Stop and answer"
  }
} satisfies TranslationCatalog;
