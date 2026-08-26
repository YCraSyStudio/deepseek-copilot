import { DEEPSEEK_PRO_MODEL_ID, type ToolDefinition } from "@/contracts";
import type { ToolRegistry } from "@/application/tools/ToolRegistry";

const WEB_TOOL_NAMES = new Set(["search_web", "read_web"]);
const TERMINAL_TOOL_NAME = "run_terminal_command";
const IMAGE_ANALYSIS_TOOL_NAME = "analyze_images";

export interface GenerationToolAvailability {
  files: boolean;
  terminal: boolean;
  webSearchEnabled: boolean;
  modelId: string;
  hasImageAttachments: boolean;
}

/**
 * Selects the tool definitions that are valid for one generation.
 *
 * This policy is intentionally platform-agnostic: callers provide only the
 * capabilities captured for the generation, while registry metadata remains
 * the source of truth for whether a tool is global or workspace-scoped.
 */
export function selectGenerationTools(
  registry: ToolRegistry,
  availability: GenerationToolAvailability,
): ToolDefinition[] {
  return registry.getDefinitionsForAPI().filter((tool) => {
    const name = tool.function.name;
    const registered = registry.get(name);

    if (registered?.metadata.scope !== "global") {
      if (!availability.files) {
        return false;
      }
      if (name === TERMINAL_TOOL_NAME && !availability.terminal) {
        return false;
      }
    }

    if (!availability.webSearchEnabled && WEB_TOOL_NAMES.has(name)) {
      return false;
    }

    if (name === IMAGE_ANALYSIS_TOOL_NAME) {
      return availability.modelId === DEEPSEEK_PRO_MODEL_ID && availability.hasImageAttachments;
    }

    return true;
  });
}
