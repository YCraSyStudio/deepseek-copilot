# Yar's DeepSeek Copilot

A DeepSeek-only coding assistant built for VS Code. Chat with DeepSeek, share workspace context, review its reasoning and tool activity, and let it work on your project under the permission mode you choose.

> **Preview:** This extension is under active development. Review proposed changes and keep important work under version control.

## Highlights

- Streaming chat with a chronological reasoning and tool timeline.
- File, search, patch, terminal, Git-context, and controlled web-search tools.
- Permission modes ranging from confirmation-first and read-only to custom or unattended access.
- Workspace path autocomplete with `./`, file attachments, and exact editor selections.
- Workspace-aware conversation history, configurable retention, and undo for deletions.
- Concurrent generations remain isolated by conversation; switching chats never redirects background output.
- **Stop** removes the complete in-progress turn from the chat and model context, then restores its prompt as an editable draft.
- API credentials stored per API origin in VS Code Secret Storage.
- English, Spanish, and Chinese interface localization.

## Requirements

- VS Code 1.131.0 or newer.
- A [DeepSeek API key](https://platform.deepseek.com/api_keys).
- Network access to the configured DeepSeek API endpoint.

## Get started

1. Install the extension and open **Yar's DeepSeek Copilot** from the Activity Bar.
2. Open **Settings** in the chat view and enter your DeepSeek API key.
3. Choose a model, generation options, and a permission mode.
4. Send a message. Type `./` to reference workspace paths, or attach files and editor selections from VS Code.

## Documentation

- [User documentation](https://ycrasystudio.github.io/deepseek-copilot/en/)
- [Documentación en español](https://ycrasystudio.github.io/deepseek-copilot/es/)
- [中文文档](https://ycrasystudio.github.io/deepseek-copilot/zh/)
- [Technical wiki](wiki/INDEX.md)
- [Release notes](CHANGELOG.md)
- [Report a bug or request a feature](https://github.com/YCraSyStudio/deepseek-copilot/issues)

## Privacy and safety

Yar's DeepSeek Copilot does not collect usage telemetry. Prompts, referenced content, conversation context, and generated responses sent to DeepSeek are handled under DeepSeek's current privacy policy and API terms. Do not send confidential, personal, or regulated information unless those terms meet your requirements.

Workspace tools follow the selected permission mode and VS Code Workspace Trust. Terminal commands are non-interactive but are not OS-sandboxed. Inspect tool calls carefully, especially when using unattended modes.

Yar's DeepSeek Copilot is an independent third-party extension. It is not affiliated with, endorsed by, sponsored by, or officially maintained by DeepSeek.

## License

[MIT](LICENSE)
