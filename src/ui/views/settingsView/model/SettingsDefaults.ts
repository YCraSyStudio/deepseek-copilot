export { DEFAULT_CONFIG } from "@/contracts/Config";
export { MODEL_OPTIONS } from "@/contracts/deepseek/Models";

export const REASONING_EFFORT_OPTIONS = [
  { value: "high", label: "chat.high" },
  { value: "max", label: "chat.max" },
] as const;
