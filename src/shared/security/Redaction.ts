const SENSITIVE_PATTERNS: RegExp[] = [
  /\b(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;}"']+/gi,
  /((?:api[\s_-]?key|token|secret)\s*["']?\s*[:=]\s*["']?)[^"',;\s}]+/gi,
  /\b((?:api[\s_-]?key|token|secret)\s+(?:(?:is|was)\s+)?)[^\s,;}"']+/gi,
  /\bsk-[A-Za-z0-9._-]{8,}\b/g,
];

export function redactSensitiveText(value: unknown, sensitiveValues: readonly string[] = []): string {
  let redacted = value instanceof Error ? value.message : String(value);
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) {
      redacted = redacted.split(sensitiveValue).join("[REDACTED]");
    }
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, (_match, prefix?: string) => `${prefix ?? ""}[REDACTED]`);
  }
  return redacted;
}
