export const WEBVIEW_PROTOCOL_VERSION = 3 as const;

export const WEBVIEW_INPUT_LIMITS = {
  chatText: 1024 * 1024,
  referenceContent: 1024 * 1024,
  totalReferenceContent: 5 * 1024 * 1024,
  references: 50,
} as const;
