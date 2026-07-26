import type { PageContent } from "../Types";

export const intro: PageContent = {
  navTitle: "Intro",
  title: "Introduction",
  description: "Introduction to Yar's DeepSeek Copilot.",
  lead: "Yar's DeepSeek Copilot is DeepSeek-only by design. It provides a focused assistant inside VS Code without provider switching.",
  sections: [
    {
      title: "Current beta scope",
      items: [
        "Sidebar chat with responses, reasoning, and tool calls streamed and rendered in chronological order.",
        "Thinking mode can be enabled or disabled without disabling tools.",
        "The chat, read-only, full-access, and auto-approve modes control read, search, edit, patch, terminal access, and delegated approval.",
        "Safe path autocomplete appears only after typing ./; auto context, Git, instructions, terminal, and tools all use the same immutable logical-workspace snapshot.",
        "Settings and global history are stored under ~/.yrs-dpsk-copilot/ with configurable retention, native deletion confirmation, and Undo.",
      ],
    },
    {
      title: "Non-affiliation",
      items: [
        "This is an independent third-party extension. It is not affiliated with, endorsed by, sponsored by, or officially maintained by DeepSeek.",
      ],
    },
  ],
};
