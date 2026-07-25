import type { PageContent } from "../Types";

export const changelog: PageContent = {
  navTitle: "Changelog",
  title: "Changelog",
  description: "Relevant changes and preview status.",
  lead: "Version 0.1.2 adds isolated concurrent generations, per-conversation queues, recoverable checkpoints, and safer workspace execution.",
  sections: [
    {
      title: "0.1.2 generation coordination",
      items: [
        "Added one active generation per conversation with configurable cross-conversation concurrency from 1 to 16, defaulting to 8.",
        "Added Queue message and Interrupt and guide controls, targeted cancellation, and generation-bound stream and tool events.",
        "Added atomic generation checkpoints that recover partial output, cancel unfinished tools, and expose queued prompts as drafts after restart.",
        "Introduced conversation schema v2 with generation ownership and a verified activation-time migration for valid legacy or partially migrated history; compatibility remains active until its scheduled cleanup release.",
        "Pinned each generation to its conversation workspace and serialized mutating tools per workspace while allowing concurrent read-only work.",
        "Added coordinated provider shutdown so active work is checkpointed, cancelled, and flushed during extension deactivation.",
      ],
    },
    {
      title: "0.1.1 reliability and security",
      items: [
        "Replaced text control markers with a native chronological assistant timeline for reasoning, content, and tool groups.",
        "Unified tool states and fixed rejection, cancellation, host acknowledgement, stale pending calls, duplicate calls, and maximum-round termination.",
        "Added real process-tree cancellation and structured non-interactive terminal results with bounded output and platform-aware danger analysis.",
        "Hardened SSE, response validation, URL joining, timeouts, Retry-After retries, and React stream batching.",
        "Moved settings and history to ~/.yrs-dpsk-copilot/. History uses one validated JSON file per conversation and no separate index.",
        "Added multi-root conversation association, context pruning, staged Git context, binary detection, delimited references, AGENTS.md limits, and optimistic file hashes.",
        "Fixed history deletion so deleting the active conversation clears Chat view while deleting another conversation leaves the current chat untouched.",
        "Completed the accessibility and UX pass with modal focus management, controlled autoscroll, streaming drafts, localized UI, workspace permissions, recoverable settings, and paginated history.",
      ],
    },
    {
      title: "0.1.0 preview",
      items: [
        "Introduced the layered source architecture, React chat webview, History, Settings, tool configuration, path autocomplete, and Marketplace packaging.",
        "Focused the product on DeepSeek and stored API keys in VS Code Secret Storage.",
      ],
    },
  ],
};
