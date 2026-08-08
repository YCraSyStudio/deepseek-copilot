import type { PageContent } from "../Types";

export const changelog: PageContent = {
  navTitle: "Changelog",
  title: "Changelog",
  description: "Relevant changes and preview status.",
  lead: "Version 0.1.8 replaces browser fallback with human-style headless search, stable semantic sections, nonce-isolated web reads, and dedicated API and Web search settings.",
  sections: [
    {
      title: "0.1.8 human-style headless search and isolated semantic reads",
      items: [
        "Search now opens the selected Bing, Google, or Baidu home page, focuses the search field, types with short per-key delays, and submits with Enter. Bing is the default; CAPTCHA, blocking, and timeout failures are terminal without visible-browser escalation or automatic retries.",
        "Search returns at most ten normalized organic HTTPS URL strings. read_web accepts an exact URL registered to its search_id, while direct URLs remain limited to addresses explicitly supplied by the user.",
        "Page reads retain only headings and paragraphs from document.body, group adjacent content into stable numbered sections, split long sections between paragraphs, and paginate through opaque cursors without renumbering.",
        "Every read uses a fresh cryptographic 128-bit nonce around JSON-safe untrusted content, with prompt-injection reminders before and after the page data and nonce collision regeneration.",
        "Settings now provide dedicated API and Web search tabs. Obsolete native web settings, visible-browser controls, manual CAPTCHA flow, and configurable usage-warning budgets were removed while the isolated proxy and browsing limits remain enforced.",
      ],
    },
    {
      title: "0.1.7 integrated-browser search and context compaction",
      items: [
        "Reworked integrated-browser search around one reusable VS Code page: searches type into the active engine, registered results open by click, navigation returns through browser history, and a compatibility mode remains available when newer browser tools are missing.",
        "Added localized DuckDuckGo, Bing, Google, and Yahoo fallback, semantic organic-result parsing, Bing redirect decoding, public-HTTPS validation, bounded caches, compact responses, semantic page extraction, and sanitized browser diagnostics.",
        "Replaced model-visible page IDs, DOM references, arbitrary navigation, and generic link following with opaque search/document IDs and only two constrained tools: search_web and the multi-mode read_web.",
        "Compacted completed conversation context to user/final-answer pairs, retaining full provider transcripts only for active or incomplete recovery, and lazily compacted duplicate legacy web output when history is saved again.",
      ],
    },
    {
      title: "0.1.6 privacy, reliability, and usage observability",
      items: [
        "Added Incognito mode for ephemeral chats: prompts, references, checkpoints, and usage remain in memory until the user explicitly saves or discards the conversation.",
        "Added provider-reported usage per request phase, generation, and conversation, including nested reasoning tokens and separate cache-hit/cache-miss counts. Missing values remain unavailable rather than becoming zero.",
        "Added current official DeepSeek V4 Flash/Pro cost estimates with a persisted catalog version, local usage breakdowns, redacted diagnostics, and warning budgets for auxiliary calls, cache-miss input, output, and generation cost.",
        "Hardened tool-call integrity, unsaved buffers, concurrent storage, partial streams, process shutdown, webview protocol negotiation, provider validation, diagnostics, CI, and packaged-VSIX release gates.",
      ],
    },
    {
      title: "0.1.5 packaging hotfix",
      items: [
        "Added an explicit *.log exclusion to the VSIX package rules so local files such as debug.log cannot be distributed.",
      ],
    },
    {
      title: "0.1.4 preview credential safety, command review, and focused tool UI",
      items: [
        "Stored API credentials are isolated by normalized API origin in VS Code Secret Storage. The legacy key migrates automatically, changing origins requires confirmation, and the webview receives only configured state plus a masked placeholder preview.",
        "DeepSeek requests enforce the selected credential origin across redirects and redact credentials from errors, logs, history, settings, checkpoints, and visible messages.",
        "Auto-approve now uses a conservative local analyzer first. Uncertain workspace-contained terminal commands can receive a separate DeepSeek review with the initial user request and bounded, non-sensitive previews of explicitly named workspace files.",
        "The reviewer can approve, request safer replanning, or require manual confirmation. Automatic decisions require medium-high confidence or above and never override workspace containment or delegate credentials, elevation, publishing, deployment, remote mutation, external access, broad process termination, or destructive operations.",
        "Adjacent reasoning and tool calls are compacted into expandable Activity panels with step count and aggregate status.",
        "Successful read_file contents are omitted from Chat. File tools provide Open file, while completed creates, edits, and patches can open the exact recorded tool change as a native VS Code diff.",
        "Confirmation panels, Settings, tool controls, and the composer now use the available width in wide sidebars and avoid global overflow in narrow sidebars.",
        "Contracts, built-in tools, command review, chat orchestration, VS Code workspace adapters, Settings, Chat UI, and tests were reorganized by domain while retaining public messages, tool names, settings, and history compatibility.",
      ],
    },
    {
      title: "0.1.3 workspace safety and generation coordination",
      items: [
        "Raised the default DeepSeek output allowance from 8,192 to 65,536 tokens, retaining the 384K maximum and documenting its relationship to the 1M-token context window.",
        "Turned the tool-round limit into a checkpoint: unattended modes ask DeepSeek whether to continue, request instructions, or stop, while attended modes retain the user decision.",
        "Improved extreme-width responsiveness across Settings, tool permissions, the chat composer/footer, and History, including VS Code's narrowest sidebar layouts.",
        "Added one active generation per conversation with configurable cross-conversation concurrency from 1 to 16, defaulting to 8.",
        "Added Queue message and Interrupt and guide controls, targeted cancellation, and generation-bound stream and tool events.",
        "Added atomic generation checkpoints that recover partial output, cancel unfinished tools, and expose queued prompts as drafts after restart.",
        "Introduced conversation schema v2 with generation ownership and a verified activation-time migration for valid legacy or partially migrated history; compatibility remains active until its scheduled cleanup release.",
        "Pinned each generation to its conversation workspace and serialized mutating tools per workspace while allowing concurrent read-only work.",
        "Added revisioned logical-workspace bindings, deterministic multi-root aliases, disconnected-history reassignment, ./-only autocomplete, and bounded external file snapshots that never grant tool access.",
        "Added coordinated provider shutdown so active work is checkpointed, cancelled, and flushed during extension deactivation.",
        "Added host-only canonical DeepSeek tool transcripts with exact reasoning, JSON arguments, tool results, protocol ordering, checkpoint recovery, and safe replay.",
        "Added total request budgeting, atomic conversation summaries, and literal relevant-line extraction for large references, with at most four auxiliary DeepSeek calls and a deterministic local fallback.",
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
