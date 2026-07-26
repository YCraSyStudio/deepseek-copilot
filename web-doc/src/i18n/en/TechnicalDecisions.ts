import type { PageContent } from "../Types";

export const technicalDecisions: PageContent = {
  navTitle: "Technical decisions",
  title: "Technical decisions",
  description: "Architecture, persistence, streaming, and execution decisions.",
  lead: "The extension separates domain state, DeepSeek transport, VS Code capabilities, and React rendering so safety rules remain authoritative in the extension host.",
  sections: [
    {
      title: "Layer boundaries",
      items: [
        "core owns provider-independent conversation, context, and tool-domain logic and does not import React or concrete HTTP clients.",
        "deepseekApi owns requests, response validation, SSE parsing, bounded retries, and tool-call orchestration.",
        "vscodeApi owns secrets, workspace access, storage, commands, terminal processes, confirmations, and host-webview routing.",
        "ui owns the React webview and changes authoritative tool state only after host messages.",
      ],
    },
    {
      title: "Chronological event model",
      items: [
        "Assistant presentation is persisted as typed reasoning, content, and tool-group events rather than control markers embedded in text.",
        "The same timeline contract renders live streams and restored history, preserving think -> tool -> think -> response order.",
        "Text deltas are grouped per animation frame and flushed before tool groups, completion, cancellation, or persistence.",
        "Message, event, conversation, and fallback tool-call IDs use crypto.randomUUID().",
      ],
    },
    {
      title: "Generation ownership and recovery",
      items: [
        "A coordinator permits one active generation per conversation and bounded concurrency across conversations. The configurable limit defaults to 8 and is clamped from 1 to 16.",
        "Client request IDs, generation IDs, and conversation IDs bind queues, streams, tool approvals, cancellation, and snapshots to the correct run.",
        "Interrupt and guide queues the new instruction first and then aborts the current run; ordinary sends append to the conversation queue.",
        "Atomic revisioned checkpoints preserve partial timelines, tool state, non-secret configuration, and queued prompts. Activation restores interrupted output and offers queued prompts as drafts.",
      ],
    },
    {
      title: "Tools and terminal",
      items: [
        "Tool state has one native lifecycle ending in completed, rejected, cancelled, or error; rejection is not encoded as an execution error.",
        "Calls within a tool round execute sequentially and duplicate name-and-argument calls are blocked. Across concurrent generations, read-only tools may overlap while workspace mutations are serialized per workspace.",
        "Terminal uses spawn with process-tree cancellation, structured results, bounded head-and-tail output, and non-zero exit detection.",
        "Each conversation stores a revisioned logical-workspace binding. Every run captures its folders, aliases, capabilities, and active-editor root once; no operation falls back to the current editor or first folder.",
        "Path authorization accepts ./ workspace paths, rejects parent traversal, absolute paths and URIs, and resolves real paths and existing ancestors to prevent symlink or junction escapes.",
        "Explicit external attachments are temporary read-only snapshots. They are not persisted and never extend tool authorization beyond the bound workspace.",
        "Confirmed file writes carry SHA-256 guards so edits and overwrites fail if disk content changes after preview.",
      ],
    },
    {
      title: "API, context, and persistence",
      items: [
        "SSE supports comments, CRLF, data fields with or without spaces, multiline events, decoder finalization, malformed JSON diagnostics, and reader cancellation.",
        "DeepSeek requests use normalized URLs, a 60-second per-attempt timeout, and at most three retries for transient failures while respecting Retry-After.",
        "Settings, schema-v2 conversation history, and generation checkpoints live under ~/.yrs-dpsk-copilot/. Checkpoints never contain the API key, and malformed history or checkpoint files are isolated.",
        "Context has aggregate budgets, binary detection, staged and unstaged Git data, bounded AGENTS.md sources, and explicit untrusted-data delimiters.",
      ],
    },
  ],
};
