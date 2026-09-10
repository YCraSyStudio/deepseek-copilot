export const DEEPSEEK_FLASH_MODEL_ID = "deepseek-flash" as const;

type DeepSeekModelId = typeof DEEPSEEK_FLASH_MODEL_ID;
/** DeepSeek V4's documented maximum generated output (384K tokens). */
export const MAX_OUTPUT_TOKENS = 384_000;

/**
 * Only the fields with a consumer are listed. Capability flags such as vision
 * or FIM were never read: the single registered model supports all of them, so
 * there is nothing for a consumer to branch on.
 */
interface DeepSeekModelInfo {
  id: DeepSeekModelId;
  name: string;
  contextLength: number;
  maxOutputTokens: number;
}

export const MODEL_REGISTRY: DeepSeekModelInfo[] = [
  {
    id: DEEPSEEK_FLASH_MODEL_ID,
    name: "DeepSeek V4.1 Flash",
    contextLength: 1_000_000,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  },
] as const;

type ModelOption = { value: DeepSeekModelId; label: string };
export const MODEL_OPTIONS: ModelOption[] = MODEL_REGISTRY.map((m) => ({
  value: m.id,
  label: m.name,
}));
