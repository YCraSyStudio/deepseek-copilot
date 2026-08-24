# Yar's DeepSeek Copilot

A DeepSeek-only coding assistant built for VS Code. Chat with DeepSeek, share workspace context, review its reasoning and tool activity, and let it work on your project under the permission mode you choose.

> **Development preview:** This extension is still under active development. Updates may change the conversation storage format and can make chats created by earlier `0.x` versions unavailable. Copy or export any conversation you need to keep before updating. Backward compatibility for saved chats will become a release commitment starting with version `1.0`.
>
> Review proposed workspace changes carefully and keep important project work under version control.

## Highlights

- Streaming chat with a chronological reasoning and tool timeline.
- File, search, patch, terminal, Git-context, and controlled web-search tools.
- Native image understanding through **DeepSeek V4 Vision (Flash)**, with a delegated `analyze_images` tool when using **DeepSeek V4 Pro**. If the experimental Vision model disappears, text-only work automatically retries once with stable V4 Flash without adding it as a selectable product model.
- Three permission modes: confirmation-first, automatic with elevated-action confirmation, and full access with critical-action confirmation.
- One attachment action for context files and images, plus image paste with `Ctrl+V`/`Cmd+V`.
- Workspace path autocomplete with `./` and exact editor selections.
- Workspace-aware conversation history, configurable retention, and undo for deletions.
- Concurrent generations remain isolated by conversation; switching chats never redirects background output.
- **Stop** preserves the submitted prompt, partial response, reasoning, and completed tool results as a terminal cancelled turn. Completed side effects are never rolled back.
- API credentials stored per API origin in VS Code Secret Storage.
- English, Spanish, and Chinese interface localization.

## Requirements

- VS Code 1.131.0 or newer.
- A [DeepSeek API key](https://platform.deepseek.com/api_keys).
- Network access to the configured DeepSeek API endpoint.

## Get started

1. Install the extension and open **Yar's DeepSeek Copilot** from the Activity Bar.
2. Open **Settings** in the chat view and enter your DeepSeek API key.
3. Choose **V4 Vision (Flash)** or **V4 Pro**, generation options, and a permission mode.
4. Send a message. Type `./` to reference workspace paths, attach a file or image with `+`, paste an image, or include an editor selection from VS Code.

## Documentation

- [User documentation](https://ycrasystudio.github.io/deepseek-copilot/en/)
- [Documentación en español](https://ycrasystudio.github.io/deepseek-copilot/es/)
- [中文文档](https://ycrasystudio.github.io/deepseek-copilot/zh/)
- [Technical wiki](wiki/INDEX.md)
- [Release notes](CHANGELOG.md)
- [Report a bug or request a feature](https://github.com/YCraSyStudio/deepseek-copilot/issues)

## Privacy and safety

Yar's DeepSeek Copilot does not collect usage telemetry. Prompts, referenced content, uploaded images, conversation context, and generated responses sent to DeepSeek are handled under DeepSeek's current privacy policy and API terms. Images use DeepSeek's Files API and are referenced by file ID instead of embedding Base64 in chat history or provider messages. Do not send confidential, personal, or regulated information unless those terms meet your requirements.

Workspace tools follow the selected permission mode and VS Code Workspace Trust. Terminal commands are non-interactive but are not OS-sandboxed. Inspect tool calls carefully, especially when using unattended modes.

Yar's DeepSeek Copilot is an independent third-party extension. It is not affiliated with, endorsed by, sponsored by, or officially maintained by DeepSeek.

## License

[MIT](LICENSE)
