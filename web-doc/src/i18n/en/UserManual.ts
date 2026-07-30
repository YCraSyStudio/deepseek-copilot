import type { PageContent } from "../Types";

export const userManual: PageContent = {
  navTitle: "User manual",
  title: "User manual",
  description: "Configure and use chat, tools, permissions, context, and global history.",
  lead: "Configure the API key, choose a permission mode, then use DeepSeek from the sidebar with explicit control over every workspace operation.",
  sections: [
    {
      title: "Getting started",
      items: [
        "Open Yar's DeepSeek Copilot from the Activity Bar and enter the API key in Settings. Credentials are stored per normalized API origin in VS Code Secret Storage; reopening Settings shows only a masked placeholder preview.",
        "Choose the model, thinking mode, reasoning effort, output allowance, tool-round checkpoint interval, and concurrent generation limit. DeepSeek V4 has a 1M-token total context and a 384K maximum output; the extension reserves 65,536 output tokens by default. Concurrency defaults to 8 and accepts values from 1 to 16.",
        "Type ./ to autocomplete safe workspace paths. Parent traversal with ../ is never accepted. In multi-root workspaces, paths begin with a stable alias such as ./frontend/src/App.tsx.",
        "Use the attachment button or Explorer/editor commands for explicit context. Files outside the workspace become bounded, read-only snapshots; they never grant tools access to the surrounding folder.",
        "Use Stop generation to interrupt the current request and any running terminal process tree. The prompt and available partial response remain in history as an interrupted turn.",
      ],
    },
    {
      title: "Concurrent generations and queues",
      items: [
        "Only one generation runs at a time in each conversation. Additional prompts in that conversation are queued in submission order.",
        "Different conversations can generate concurrently up to the configured global limit.",
        "While a response is active, Queue message appends the draft and Interrupt and guide places guidance at the front of the queue before stopping the current generation.",
        "Switching conversations or recreating the webview does not transfer stream or tool events between runs; every event is bound to its generation and conversation.",
        "If VS Code closes, partial output is restored as interrupted, unfinished tools become cancelled, and queued prompts are offered as recoverable drafts on the next activation.",
      ],
    },
    {
      title: "Permissions and tool states",
      items: [
        "default asks before every tool; read-only auto approves read/list/search while keeping mutations available with confirmation; auto-approve delegates workspace-contained operations; full-access permits unrestricted computer access after a global warning. custom controls each tool.",
        "Each tool can be disabled, require manual approval, or use safe-only auto approval. Full access is unattended and should only be used in trusted workspaces; workspace binding and VS Code Workspace Trust remain enforced.",
        "Tool calls move through awaiting confirmation, running, and one terminal state: completed, rejected, cancelled, or error.",
        "The extension host acknowledges execute and reject actions before the webview commits the visible state.",
        "Tool calls in a round run sequentially and identical repeated calls are skipped. At each configured round checkpoint, auto-approve and full-access have DeepSeek reassess whether to continue with tools, ask for instructions, or stop; other modes ask the user whether to grant another batch.",
        "Read-only tools may run across concurrent conversations, while file and terminal mutations are serialized within the same workspace.",
      ],
    },
    {
      title: "Activity and file results",
      items: [
        "Adjacent reasoning and tool calls are collapsed into an Activity panel by default. Expand it to inspect individual reasoning steps, tool states, arguments, and relevant results.",
        "A successful read_file call does not duplicate the file body in Chat. Use Open file to inspect it in the editor; failed reads still show their diagnostic result.",
        "Completed create_file, edit_file, and apply_patch calls expose View change when a complete diff is available. It opens the before and after content recorded for that specific tool execution, independent of later working-tree changes.",
      ],
    },
    {
      title: "Workspace content search",
      items: [
        "search_content matches literal text case-insensitively through the VS Code workspace filesystem; it does not run a shell or treat the query as a regular expression. The query must contain text and is limited to 4,096 characters.",
        "Its optional filePattern is a workspace-relative glob such as *.ts or src/**/*.md. It defaults to **/*, is limited to 1,024 characters, and rejects absolute paths and parent traversal.",
        "Sensitive paths, binary files, and files larger than 2 MiB are skipped. Sensitive files are filtered before their contents are read.",
        "A search considers at most 10,000 files and returns at most 50 matches. Result lines and total output are bounded, and the response reports scanned and skipped files plus whether it was truncated.",
        "Search stops when the request is cancelled and times out after 15 seconds.",
      ],
    },
    {
      title: "Terminal execution",
      items: [
        "Terminal commands are non-interactive: they cannot answer prompts or provide a TTY.",
        "The result records stdout, stderr, exit code, signal, timeout, cancellation, effective working directory, and shell.",
        "Output is bounded; when truncated, the beginning and end are retained and the omitted middle is marked.",
        "Outside global Auto approve, unknown commands require caution. Chained Bash, PowerShell, and cmd segments, publishing, deployment, remote changes, package managers, redirects, and destructive operations are reviewed before execution.",
        "In auto-approve, local analysis runs first. An uncertain but workspace-contained command may be sent to a separate DeepSeek reviewer together with the initial user request and bounded, non-sensitive context from explicitly named workspace files.",
        "The reviewer may approve, return constraints for safer replanning, or request manual confirmation. Automatic approval or replanning requires medium-high confidence or above; sensitive, external, elevated, remote, broad process-termination, and destructive operations stay manual.",
      ],
    },
    {
      title: "History and privacy",
      items: [
        "Settings are stored in ~/.yrs-dpsk-copilot/settings.json. API credentials remain in VS Code Secret Storage, isolated by normalized origin, and are never included in WebviewConfig, history, or checkpoints.",
        "History is stored globally as one JSON file per conversation in ~/.yrs-dpsk-copilot/history/ and each entry shows its source workspace.",
        "History can be disabled and retention can be configured from 0 days (manual deletion only) to 3650 days. The default is 30 days.",
        "The history list is rebuilt directly from validated conversation files. Storage is capped at 100 conversations and 24 MiB.",
        "Deleting one conversation or all visible conversations uses a native VS Code confirmation and offers Undo. Deletion first cancels that conversation's active generation, clears its queue and checkpoint, and clears Chat view when the selected conversation is deleted.",
        "Conversation files use schema version 2 and associate messages with generation outcomes. On activation, valid older or partially migrated files are atomically upgraded with deterministic generation ownership. Compatibility has no runtime expiry and remains until its scheduled cleanup is released.",
        "Active work is checkpointed without the API key under ~/.yrs-dpsk-copilot/generation-checkpoints/. Interrupted pending or running tools are restored as cancelled; corrupt history and checkpoint records are isolated in their respective corrupt directories.",
      ],
    },
    {
      title: "Context and slash commands",
      items: [
        "Auto context includes the active editor plus staged and unstaged Git changes with time and size limits.",
        "Referenced files and AGENTS.md instructions are size-limited, use workspace-relative labels, and are delimited as untrusted data.",
        "The total request budget includes system prompts, tool schemas, history, references, output allowance, and safety margin. Complete older generations are summarized atomically; large files are reduced to literal relevant line ranges. Tool arguments, required reasoning, and active tool cycles are never truncated.",
        "Use /context to inspect what a normal request would send. Other commands include /status, /tools, /mode, /auto-context, /review, /goal, /summarize, and /clear-context.",
      ],
    },
  ],
};
