> Priority: **P0 — stable release blocker**

## Context

The API key is stored in VS Code `SecretStorage`, but the extension host sends the complete secret back to the webview in configuration messages. This unnecessarily expands the credential's exposure to webview code and dependencies.

The base URL validator also permits plain HTTP for any hostname. Changing the API origin reuses the same global credential, and the settings warning compares URL text rather than the parsed origin.

Relevant code:

- `src/vscodeApi/webviews/handlers/SettingsHandler.ts`
- `src/vscodeApi/webviews/handlers/ChatHandler.ts`
- `src/vscodeApi/webviews/WebviewMessageValidation.ts`
- `src/vscodeApi/storage/SettingsManager.ts`
- `src/deepseekApi/auth/AuthHeaders.ts`
- `src/ui/views/settingsView/tabs/general/sections/advancedSection/AdvancedSection.tsx`

## Objective

Keep stored credentials inside the extension host and prevent accidental transmission to insecure or unintended origins.

## To-Do List

- [ ] Stop including the stored API key in host-to-webview configuration messages.
- [ ] Send only configured/missing status and a non-sensitive preview.
- [ ] Treat a key entered in settings as a one-way replacement value and clear the field after acknowledgement.
- [ ] Run connection tests in the extension host using the stored key or an explicitly submitted replacement.
- [ ] Require HTTPS for non-loopback endpoints.
- [ ] Parse and compare URL origins rather than using string-prefix checks.
- [ ] Require explicit confirmation when changing the credential's destination origin.
- [ ] Decide whether credentials should be stored per origin and migrate existing storage safely.
- [ ] Reject cross-origin absolute API URLs and redirects before attaching authorization.
- [ ] Ensure logs and diagnostics redact authorization headers and key-like values.

## Acceptance Criteria

- [ ] The full stored key is never posted from the extension host to a webview.
- [ ] Non-loopback HTTP endpoints are rejected.
- [ ] Lookalike domains cannot bypass the external-origin warning.
- [ ] Changing origin cannot silently reuse a credential without the defined consent flow.
- [ ] Redirects and absolute URLs cannot move an authenticated request to another origin.
- [ ] Existing users can upgrade without losing their stored key.

## Regression Tests

- [ ] Assert that every host-to-webview configuration payload omits the secret.
- [ ] Test HTTPS, HTTP loopback, HTTP non-loopback, credentials in URLs, and lookalike hostnames.
- [ ] Test origin changes, connection tests, key replacement, reset, and migration.
- [ ] Test same-origin and cross-origin redirects and absolute request URLs.
- [ ] Add redaction tests for errors and future diagnostic output.
