const STREAM_GUARD_CHARS = 128;

const SERIALIZED_TOOL_PROTOCOL_PATTERNS = [
  /<\s*\|?\s*DSML\s*\|?\s*(?:tool_calls|invoke|parameter)\b/i,
  /<[^>\r\n]{0,32}\bDSML\b[^>\r\n]{0,32}\b(?:tool_calls|invoke|parameter)\b/i,
];

export function findSerializedToolProtocolStart(content: string): number | undefined {
  const normalized = content.normalize("NFKC");
  let earliest: number | undefined;
  for (const pattern of SERIALIZED_TOOL_PROTOCOL_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match && (earliest === undefined || match.index < earliest)) {
      earliest = match.index;
    }
  }
  return earliest;
}

export function containsSerializedToolProtocol(content: string | null | undefined): boolean {
  return typeof content === "string" && findSerializedToolProtocolStart(content) !== undefined;
}

/** Holds a short tail so a DSML marker split across SSE chunks is never displayed. */
export class SerializedToolProtocolStreamGuard {
  private buffer = "";
  private detected = false;

  push(content: string): string {
    if (!content || this.detected) {return "";}
    const candidate = this.buffer + content;
    const protocolStart = findSerializedToolProtocolStart(candidate);
    if (protocolStart !== undefined) {
      this.detected = true;
      this.buffer = "";
      return candidate.slice(0, protocolStart);
    }
    if (candidate.length <= STREAM_GUARD_CHARS) {
      this.buffer = candidate;
      return "";
    }
    const splitAt = candidate.length - STREAM_GUARD_CHARS;
    this.buffer = candidate.slice(splitAt);
    return candidate.slice(0, splitAt);
  }

  finish(): string {
    if (this.detected) {return "";}
    const content = this.buffer;
    this.buffer = "";
    return content;
  }

  get hasDetectedProtocol(): boolean {
    return this.detected;
  }
}
