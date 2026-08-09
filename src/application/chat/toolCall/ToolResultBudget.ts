import { takeUtf8Head, takeUtf8Tail } from "@/shared/utils/BoundedText";

export const MAX_TOOL_RESULT_MODEL_BYTES = 128 * 1024;

export function fitToolResultForModel(value: string, maxBytes = MAX_TOOL_RESULT_MODEL_BYTES): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {return value;}
  const marker = "\n...[tool result truncated for model context; middle omitted]...\n";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (markerBytes > maxBytes) {return takeUtf8Head(value, maxBytes);}
  const sideBudget = Math.max(0, Math.floor((maxBytes - markerBytes) / 2));
  const head = takeUtf8Head(value, sideBudget);
  const tail = takeUtf8Tail(value.slice(head.length), sideBudget);
  return `${head}${marker}${tail}`;
}
