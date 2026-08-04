import type { ChatCompletionRequest, ChatCompletionResponse, ReferencedFile } from "@/adapters";
import { createHash } from "crypto";
import type { ApiContextUnit } from "@/core/chat/ConversationState";
import type { ConversationContextSummary } from "@/core/chat/ProviderTranscript";
import type { ProviderUsage, UsagePhase } from "@/shared/usage/Usage";

const AUXILIARY_MAX_TOKENS = 4096;
const MAX_RANGE_COUNT = 12;

export interface ContextCompactionProvider {
  chatCompletion(request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResponse>;
}

export class ContextCompactor {
  private calls = 0;

  constructor(
    private readonly provider: ContextCompactionProvider,
    private readonly model: string,
    private readonly signal: AbortSignal,
    private readonly maxCalls = 4,
    private readonly onUsage?: (phase: UsagePhase, usage?: ProviderUsage) => void,
  ) {}

  async summarize(
    units: ApiContextUnit[],
    previousSummary?: ConversationContextSummary,
  ): Promise<ConversationContextSummary> {
    const source = [
      previousSummary?.content ? `Previous summary:\n${previousSummary.content}` : "",
      ...units.map((unit) => `<generation id="${unit.generationId}">\n${unit.visibleText}\n</generation>`),
    ].filter(Boolean).join("\n\n");
    const coveredGenerationIds = [
      ...(previousSummary?.coveredGenerationIds ?? []),
      ...units.map((unit) => unit.generationId),
    ].filter((id, index, all) => all.indexOf(id) === index);

    try {
      const content = await this.complete("context_summary", [
        {
          role: "system",
          content: "Summarize coding conversation context faithfully and compactly. Preserve decisions, constraints, unresolved work, errors, file names, symbols and exact user requirements. Never invent facts. Return only the summary.",
        },
        { role: "user", content: source },
      ]);
      if (!content.trim()) {
        throw new Error("Empty compaction response");
      }
      return createSummary("deepseek", content.trim(), coveredGenerationIds, source);
    } catch (error) {
      if (this.signal.aborted) {
        throw createAbortError();
      }
      return createSummary("local", buildLocalSummary(units, previousSummary), coveredGenerationIds, source);
    }
  }

  async compactFiles(files: ReferencedFile[], prompt: string): Promise<ReferencedFile[]> {
    const compacted: ReferencedFile[] = [];
    for (const file of files) {
      if (!file.content || file.type === "directory") {
        compacted.push(file);
        continue;
      }
      const lines = file.content.split(/\r?\n/);
      if (lines.length <= 400) {
        compacted.push(file);
        continue;
      }
      const ranges = await this.selectRanges("file_compaction", file.path, lines, prompt);
      compacted.push({
        ...file,
        content: extractLiteralRanges(lines, ranges),
      });
    }
    return compacted;
  }

  private async selectRanges(phase: UsagePhase, path: string, lines: string[], prompt: string): Promise<LineRange[]> {
    const numbered = lines.map((line, index) => `${index + 1}: ${line}`).join("\n");
    try {
      const raw = await this.complete(phase, [
        {
          role: "system",
          content: `Select only line ranges relevant to the user's coding request. Return strict JSON as {"ranges":[{"start":1,"end":20}]}. Use 1-based inclusive lines, at most ${MAX_RANGE_COUNT} ranges. Do not reproduce or rewrite source code.`,
        },
        {
          role: "user",
          content: `Request:\n${prompt}\n\nFile: ${path}\n\n${numbered}`,
        },
      ]);
      return parseRanges(raw, lines.length);
    } catch (error) {
      if (this.signal.aborted) {
        throw createAbortError();
      }
      return selectLocalRanges(lines, prompt);
    }
  }

  private async complete(phase: UsagePhase, messages: ChatCompletionRequest["messages"]): Promise<string> {
    if (this.calls >= this.maxCalls) {
      throw new Error("Auxiliary compaction call limit reached");
    }
    if (this.signal.aborted) {
      throw createAbortError();
    }
    this.calls += 1;
    let usage: ProviderUsage | undefined;
    try {
      const response = await this.provider.chatCompletion({
        model: this.model,
        messages,
        thinking: { type: "disabled" },
        tool_choice: "none",
        max_tokens: AUXILIARY_MAX_TOKENS,
      }, this.signal);
      usage = response.usage;
      if (this.signal.aborted) {
        throw createAbortError();
      }
      return response.choices[0]?.message.content ?? "";
    } finally {
      this.onUsage?.(phase, usage);
    }
  }
}

function createAbortError(): Error {
  const error = new Error("Context compaction cancelled");
  error.name = "AbortError";
  return error;
}

interface LineRange {
  start: number;
  end: number;
}

function parseRanges(raw: string, lineCount: number): LineRange[] {
  const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(json) as { ranges?: unknown };
  if (!Array.isArray(parsed.ranges)) {
    throw new Error("Invalid line range response");
  }
  const ranges = parsed.ranges.slice(0, MAX_RANGE_COUNT).map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("Invalid line range");
    }
    const start = Math.trunc(Number((value as { start?: unknown }).start));
    const end = Math.trunc(Number((value as { end?: unknown }).end));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > lineCount) {
      throw new Error("Line range outside source");
    }
    return { start, end };
  });
  if (ranges.length === 0) {
    throw new Error("No relevant ranges returned");
  }
  return ranges;
}

function extractLiteralRanges(lines: string[], ranges: LineRange[]): string {
  return ranges
    .map(({ start, end }) => `/* lines ${start}-${end}; omitted regions are unchanged */\n${lines.slice(start - 1, end).join("\n")}`)
    .join("\n\n/* … omitted … */\n\n");
}

function selectLocalRanges(lines: string[], prompt: string): LineRange[] {
  const terms = new Set(
    prompt.toLowerCase().match(/[a-z_][a-z0-9_.-]{2,}/g)?.slice(0, 40) ?? [],
  );
  const hits = lines
    .map((line, index) => ({ index, score: [...terms].filter((term) => line.toLowerCase().includes(term)).length }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RANGE_COUNT);
  const centers = hits.length > 0 ? hits.map(({ index }) => index) : [0, Math.max(0, lines.length - 1)];
  return centers
    .map((index) => ({ start: Math.max(1, index - 20), end: Math.min(lines.length, index + 21) }))
    .sort((left, right) => left.start - right.start)
    .filter((range, index, all) => index === 0 || range.start > all[index - 1].end);
}

function buildLocalSummary(
  units: ApiContextUnit[],
  previousSummary?: ConversationContextSummary,
): string {
  const sections = [
    previousSummary?.content ? `Earlier context:\n${previousSummary.content}` : "",
    ...units.map((unit) => unit.visibleText),
  ].filter(Boolean);
  const maxCharacters = 24_000;
  const combined = sections.join("\n\n");
  return combined.length <= maxCharacters
    ? combined
    : `${combined.slice(0, 12_000)}\n\n[older detail compacted locally]\n\n${combined.slice(-12_000)}`;
}

function createSummary(
  provider: ConversationContextSummary["provider"],
  content: string,
  coveredGenerationIds: string[],
  source: string,
): ConversationContextSummary {
  return {
    schemaVersion: 1,
    provider,
    content,
    coveredGenerationIds,
    sourceDigest: createHash("sha256").update(source).digest("hex"),
    updatedAt: Date.now(),
  };
}
