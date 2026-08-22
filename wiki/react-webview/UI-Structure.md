[Back](INDEX.md)

# UI Structure

## Views

`ChatView` renders messages, chronological streaming, Activity groups, image previews, path autocomplete, tool confirmations, queues, steering, and targeted Stop.

The composer is one rounded container modeled after a compact coding-agent input:

- text and image previews share the upper content area.
- one `+` action attaches either context files or images.
- `Ctrl+V`/`Cmd+V` pastes images into the same attachment list.
- one compact menu combines model and reasoning, such as `V4 Vision (Flash) · High`; selection does not close it, and clicking outside does.
- permission mode and one contextual generation action stay in the footer. During streaming it shows Stop for an empty draft, Interrupt and guide when the draft has content, and Queue message while `Ctrl` is held. `Enter` guides, `Ctrl+Enter` queues, and `Shift+Enter` inserts a newline.

`HistoryView` lists, loads, paginates, deletes, and restores conversations. Undo remains available before permanent deletion cleans image files.

`SettingsView` has three public tabs: General, API, and Tools. Tools contains Permission mode followed by the Web search toggle and engine selector. There is no per-tool permission matrix or separate Web search tab, and saving does not show a redundant success toast.

## Rendering

Adjacent reasoning and tool events collapse into Activity panels without changing persisted order. Successful `read_file` bodies are not duplicated in Chat; file tools expose Open file, and mutations expose their recorded native change view when complete.

Image cards use host-generated preview URIs. Removing a draft card asks the host to delete its local and remote resources; the webview never reads the filesystem or calls DeepSeek directly.

## Responsive behavior

All controls use the webview viewport, `min-width: 0`, minimal horizontal padding, wrapping, and content-sized menus. The combined model/reasoning popover follows its actual content width and stays within the viewport. No supported sidebar width should require horizontal scrolling.

[Back](INDEX.md)
