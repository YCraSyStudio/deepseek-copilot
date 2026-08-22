export const DEEPSEEK_VISION_MODEL_ID = "deepseek-v4-flash-vision-exp" as const;
export const DEEPSEEK_FLASH_FALLBACK_MODEL_ID = "deepseek-v4-flash" as const;
export const DEEPSEEK_PRO_MODEL_ID = "deepseek-v4-pro" as const;

export type DeepSeekModelId = typeof DEEPSEEK_VISION_MODEL_ID | typeof DEEPSEEK_PRO_MODEL_ID;
export type DeepSeekTransportModelId = DeepSeekModelId | typeof DEEPSEEK_FLASH_FALLBACK_MODEL_ID;
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
  supportsVision: boolean;
}

export const MODEL_REGISTRY: DeepSeekModelInfo[] = [
  {
    id: DEEPSEEK_VISION_MODEL_ID,
    name: "DeepSeek V4 Vision (Flash)",
    contextLength: 1_000_000,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    supportsThinking: true,
    supportsFIM: false,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: DEEPSEEK_PRO_MODEL_ID,
    name: "DeepSeek V4 Pro",
    contextLength: 1_000_000,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    supportsThinking: true,
    supportsFIM: true,
    supportsTools: true,
    supportsVision: false,
  },
] as const;

export type ModelOption = { value: DeepSeekModelId; label: string };
export const MODEL_OPTIONS: ModelOption[] = MODEL_REGISTRY.map((m) => ({
  value: m.id,
  label: m.name,
}));
