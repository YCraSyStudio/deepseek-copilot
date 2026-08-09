export type { DeepSeekModelId, DeepSeekModelInfo, ReasoningEffort } from "@/contracts/deepseek/Models";

export type ThinkingModeType = "enabled" | "disabled";
export interface ThinkingConfig {
  type: ThinkingModeType;
}
export type StopSequences = string[];
