export type DeepSeekModelId = "deepseek-v4-flash" | "deepseek-v4-pro";
export type ReasoningEffort = "high" | "max";
/** DeepSeek V4's documented maximum generated output (384K tokens). */
export const MAX_OUTPUT_TOKENS = 384_000;

export interface DeepSeekModelInfo {
  id: DeepSeekModelId;
  name: string;
  contextLength: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  supportsFIM: boolean;
  supportsTools: boolean;
}

export const MODEL_REGISTRY: DeepSeekModelInfo[] = [
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    contextLength: 1_000_000,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    supportsThinking: true,
    supportsFIM: false,
    supportsTools: true,
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextLength: 1_000_000,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    supportsThinking: true,
    supportsFIM: true,
    supportsTools: true,
  },
] as const;

export type ModelOption = { value: DeepSeekModelId; label: string };
export const MODEL_OPTIONS: ModelOption[] = MODEL_REGISTRY.map((m) => ({
  value: m.id,
  label: m.name,
}));
