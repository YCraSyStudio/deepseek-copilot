export { DEFAULT_CONFIG } from "@/adapters/Config";
export { MODEL_OPTIONS } from "@/adapters/deepseek/Models";

export const REASONING_EFFORT_OPTIONS = [
  { value: "high", label: "chat.high" },
  { value: "max", label: "chat.max" },
] as const;
