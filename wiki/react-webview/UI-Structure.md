[Back](INDEX.md)

# UI Structure

## Entry

- `src/ui/index.html`
- `src/ui/Main.tsx`
- `src/ui/App.tsx`

## Views

`ChatView`

- messages.
- input.
- path autocomplete through `FileSelector`.
- streaming.
- tool confirmations.
- targeted stop, queue, and interrupt-and-guide controls while a generation is active.
- recoverable draft prompts after an interrupted VS Code session.

`HistoryView`

- conversation list.
- load and delete actions.

`SettingsView`

- API key.
- base URL.
- model.
- reasoning.
- generation parameters.
- concurrent generation limit.
- tool modes.

## Shared components

- `Header`
- `Slider`
- `Toggle`
- `NumInput`
- global VS Code-like tooltips in `src/ui/App.css` through `data-tooltip`.
- base styles in `src/ui/styles`.

## Narrow layouts

Responsive rules follow the webview viewport rather than assuming a normal
sidebar width. Below 360 px, chat footer controls and settings fields may wrap;
below 340 px, each per-tool permission row stacks its name and selector; below
300 px, Settings reduces padding and History moves search above sort/delete;
below 260 px, the chat footer gives the model its own row and places reasoning
beside the compact attachment action; below 220 px, history items reduce action
spacing. Selects must be allowed to shrink with `min-width: 0`
inside these layouts. No view should require horizontal scrolling at the
narrowest VS Code sidebar width.

## Naming note

A `tabs/providers` folder may still exist from the migration. Its content must represent DeepSeek-only configuration, not a provider selector.

[Back](INDEX.md)
