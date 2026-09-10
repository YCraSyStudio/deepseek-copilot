[Back](INDEX.md)

# Models and Configuration

Sources of truth:

- `src/contracts/deepseek/Models.ts`
- `src/contracts/Config.ts`
- `src/application/settings/ConfigurationSchema.ts`
- `src/shared/usage/UsagePricing.ts`
- `src/platform/vscode/storage/SettingsManager.ts`

## Product model

The extension exposes exactly one model choice: **DeepSeek V4.1 Flash** (`deepseek-flash`). The registry gives it a 1M-token context and a 384K maximum output; thinking, tool calling, and native vision are its documented API capabilities. It reads DeepSeek Files API image references directly, in chat and in tool rounds, so no delegation tool mediates vision.

Retired names are not translated. The `normalizeModelId` compatibility map was removed in `0.1.14`, so `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, and `deepseek-v4-pro` are ordinary unknown identifiers: `assertCompatibleModel` rejects them on the official endpoint, the context budget falls back to the conservative 128K/8K profile, and `UsagePricing` publishes no rate for them. A stored setting that still holds one of them has to be re-selected. Model names persisted inside conversations remain opaque data, so history keeps loading without being rewritten.

There is no provider-side transport fallback and no model rewriting: a failed request is surfaced as-is. The former delegated `analyze_images` tool and the hidden Vision-to-Flash retry were removed in `0.1.14`.

DeepSeek exposes FIM completion on a beta endpoint, but the extension implements no FIM request path yet.

## Generation configuration

- `model` defaults to `deepseek-flash`; on the official endpoint only a registered model ID is accepted.
- `thinkingEnabled` controls DeepSeek thinking mode; tools remain available when thinking is off.
- `reasoningEffort` is `off`, `high`, or `max` in the product UI.
- `maxTokens` is the requested output allowance, defaults to 384,000, and is clamped from 1 to 384,000.
- `maxConcurrentGenerations` defaults to 8 and is clamped from 1 to 16.
- `permissionMode` is exactly `default`, `auto-approve`, or `full-access`.
- `webSearchEnabled` removes or restores `search_web` and `read_web` in model requests.
- `usageCostCurrency` is `usd` or `cny` and selects how the usage popover displays cost. Any other value is rejected when settings are saved.

Tool execution has no artificial round or tool-call cap; context, output, cancellation, duplicate-call safeguards, and a tool-free progress review every 20 completed rounds remain in force.

The compact chat picker displays model and reasoning together, such as `V4.1 Flash · High`. It stays open while either choice is changed and closes when the user clicks outside.

## Context and output budget

Registered model capabilities use a 1M-token total context and a 384K maximum output. System prompts, tool schemas, history, references, image metadata, requested output, and a safety margin all participate in request budgeting. Unknown compatible endpoints fall back to a conservative 128K context and 8,192 output tokens.

## Usage pricing

`UsagePricing.ts` prices only the official DeepSeek origin; custom endpoints never receive a guessed cost. DeepSeek publishes a USD table and a CNY table instead of an exchange rate, so each display currency uses its own documented numbers.

Off-peak rates per 1M tokens:

| Currency | Cache hit | Cache miss | Output |
|----------|-----------|------------|--------|
| USD      | $0.003    | $0.15      | $0.6   |
| CNY      | ¥0.02     | ¥1         | ¥4     |

Weekdays 01:00-04:00 and 06:00-10:00 UTC (09:00-12:00 and 14:00-18:00 Beijing time) are billed at twice those rates. Only `deepseek-flash` is priced; a retired or unknown model name yields no estimate instead of borrowing the current rates.

Persisted aggregates stay canonical in USD (`currency: "USD"` plus `costUsd`). `estimateAggregateCost` returns the stored estimate for USD and reprices the reported tokens from the CNY table for display, so no persisted aggregate changes unit when the setting changes. When some requests omit usage, the popover marks the calculable reported-request cost as an explicitly labelled lower bound.

## Image transport

- Supported image signatures are JPEG, PNG, GIF, and WebP.
- Images are uploaded with `purpose=user_data` and a 30-day expiry.
- Provider messages reference `{ type: "file", file_id }`; they do not embed Base64 or local paths.
- Image tokens are billed together with the text tokens of the same request.

Recheck [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) and the [Vision guide](https://api-docs.deepseek.com/guides/vision) before changing identifiers, capabilities, or rates.

[Back](INDEX.md)
