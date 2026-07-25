> Priority: **P1 — required before release candidate**

## Context

Several provider-facing options and capability descriptions do not match the requests actually sent:

- Strict tool mode requires DeepSeek's beta endpoint, while the beta toggle only re-applies `strict: true` to definitions that are already strict.
- Tool-enabled chat is forced into thinking mode even when the user selected reasoning off, while status/help text claims tools require the UI thinking setting.
- Model capability metadata does not consistently reflect current FIM support.
- Request and finish-reason behavior is not covered by provider contract tests.

Relevant code:

- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/vscodeApi/webviews/handlers/chat/toolCalls/ToolCallSession.ts`
- `src/deepseekApi/`
- model registry and FIM request definitions under `src/`

Official references:

- https://api-docs.deepseek.com/guides/tool_calls/
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/quick_start/pricing/

## Objective

Make every exposed DeepSeek setting and model capability produce the documented request behavior, with contract tests that detect upstream drift.

## To-Do List

- [ ] Implement beta strict mode with the required endpoint and strict schemas, or remove the ineffective toggle.
- [ ] Omit strict-only behavior outside the supported endpoint.
- [ ] Decide whether tools should honor non-thinking mode and make runtime behavior, status commands, and documentation agree.
- [ ] Update model capability metadata, including FIM support, from one authoritative registry.
- [ ] Validate selected/custom model IDs against the intended compatibility policy.
- [ ] Surface provider finish reasons and unsupported combinations explicitly.
- [ ] Add fixtures for request URLs, headers, bodies, message sequences, and streaming responses.
- [ ] Document how custom base URLs interact with beta endpoints.

## Acceptance Criteria

- [ ] Enabling a provider option changes the outgoing request exactly as documented.
- [ ] Disabled options do not leak strict/beta-specific fields.
- [ ] `/status`, `/tools`, settings, and runtime availability report the same capabilities.
- [ ] Model metadata agrees with current official DeepSeek documentation.
- [ ] Provider changes can be verified without using a real API key.

## Regression Tests

- [ ] Snapshot normal and beta tool-call request composition.
- [ ] Tool calls with thinking on and off.
- [ ] Flash/Pro FIM capability selection.
- [ ] Custom base URL plus beta setting behavior.
- [ ] All supported finish reasons and malformed/unsupported responses.
