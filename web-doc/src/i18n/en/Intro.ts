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
        "Reasoning and tools stay compact in expandable Activity groups; file tools open the affected file or the exact recorded change in the native editor.",
        "Thinking mode can be enabled or disabled without disabling tools.",
        "DeepSeek V4 Vision (Flash) reads uploaded images directly; V4 Pro can call analyze_images to receive a Vision-generated text description.",
        "One attachment action accepts context files and JPEG, PNG, GIF, or WebP images, and images can also be pasted with Ctrl+V or Cmd+V.",
        "Default confirms every tool, auto-approve runs routine operations automatically and confirms elevated actions, and full-access confirms only critical actions that could broadly damage the computer.",
        "Safe path autocomplete appears only after typing ./; auto context, Git, instructions, terminal, and tools all use the same immutable logical-workspace snapshot.",
        "Settings and global history are stored under ~/.yrs-dpsk-copilot/ with configurable retention, native deletion confirmation, and Undo.",
        "Explicit Stop preserves the submitted prompt, partial timeline, and completed tool results as a cancelled turn. Steering safely restarts the transport but explicitly continues the original task under the latest guidance without showing a misleading interruption warning.",
        "API credentials are isolated by origin in VS Code Secret Storage and never returned to the webview; Settings shows only a masked placeholder preview.",
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
