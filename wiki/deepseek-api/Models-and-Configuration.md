[Back](INDEX.md)

# Models and Configuration

Sources of truth:

- `src/contracts/deepseek/Models.ts`
- `src/contracts/Config.ts`
- `src/application/settings/ConfigurationSchema.ts`
- `src/platform/vscode/storage/SettingsManager.ts`

## Product models

The extension exposes two model choices:

- **DeepSeek V4 Vision (Flash)** — `deepseek-v4-flash-vision-exp`; default. It accepts text and DeepSeek Files API references directly.
- **DeepSeek V4 Pro** — `deepseek-v4-pro`. It remains the primary coding model and can use `analyze_images`, which asks V4 Vision to describe the current prompt's images and returns that text to Pro.

There is no separate non-visual Flash option. The Vision label makes the experimental visual capability explicit while retaining its Flash positioning.

## Experimental-model fallback

`deepseek-v4-flash` is an internal transport fallback, not a third product choice. On the official DeepSeek origin, the provider retries exactly once with stable Flash only when Vision returns a model-unavailable signal or an HTTP 404/410 response.

- Text-only Vision requests and connection tests continue through stable Flash.
- A streaming Vision chat with images removes the file blocks and adds a system instruction requiring an explicit limitation notice and forbidding invented visual details.
- V4 Pro's non-streaming `analyze_images` delegation fails explicitly when Vision is unavailable. Stable Flash is never presented to Pro as if it had analyzed an image.
- Authentication, authorization, rate-limit, ordinary server, cancellation, and custom-endpoint failures are not fallback conditions.

The policy lives in `VisionFallback.ts` and is consumed only by the DeepSeek provider. UI state, generation orchestration, and persisted conversations do not implement or store fallback state.

## Generation configuration

- `thinkingEnabled` controls DeepSeek thinking mode; tools remain available when thinking is off.
- `reasoningEffort` is `off`, `high`, or `max` in the product UI.
- `maxTokens` is the requested output allowance, defaults to 8,192, and is clamped from 1 to 384,000.
- Tool execution has no artificial round or tool-call cap; context, output, cancellation, duplicate-call safeguards, and a tool-free progress review every 20 completed rounds remain in force.
- `maxConcurrentGenerations` defaults to 8 and is clamped from 1 to 16.
- `permissionMode` is exactly `default`, `auto-approve`, or `full-access`.
- `webSearchEnabled` removes or restores `search_web` and `read_web` in model requests.

The compact chat picker displays model and reasoning together, for example `V4 Vision (Flash) · High`. It stays open while either choice is changed and closes when the user clicks outside.

## Context and output budget

Registered V4 capabilities use a 1M-token total context and a 384K maximum output. The 8,192-token default is an application allowance, not the model maximum. System prompts, tool schemas, history, references, image metadata, requested output, and a safety margin all participate in request budgeting.

## Image transport

- Supported image signatures are JPEG, PNG, GIF, and WebP.
- Images are uploaded with `purpose=user_data` and a 30-day expiry.
- Provider messages reference `{ type: "file", file_id }`; they do not embed Base64 or local paths.
- V4 Pro sees only the bounded textual result of `analyze_images`.
- The delegated Vision request runs with thinking disabled and an 8,192-token output cap.

Official stable-model availability and experimental Vision availability can change independently. Recheck [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) and the [Vision guide](https://api-docs.deepseek.com/guides/vision) before changing identifiers or capabilities.

[Back](INDEX.md)
