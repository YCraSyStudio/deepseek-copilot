import type { ChatMessage } from "@/contracts";
import { getTextContent } from "@/contracts/deepseek/Chat";
import { DEEPSEEK_FLASH_FALLBACK_MODEL_ID, DEEPSEEK_VISION_MODEL_ID } from "@/contracts/deepseek/Models";
import { DeepSeekApiError } from "@/infrastructure/deepseek/errors/DeepSeekApiError";
import { getApiOrigin } from "@/shared/security/ApiOrigin";
import type { ChatRequest } from "./features/Chat";

const OFFICIAL_DEEPSEEK_ORIGIN = "https://api.deepseek.com";

export class VisionFallbackUnavailableError extends Error {
  constructor() {
    super("DeepSeek V4 Vision is unavailable. The attached images could not be analyzed; retry without images or switch to V4 Pro after Vision returns.");
    this.name = "VisionFallbackUnavailableError";
  }
}

export function shouldFallbackFromVision(error: unknown, request: ChatRequest, baseUrl: string): boolean {
  if (request.model !== DEEPSEEK_VISION_MODEL_ID || getApiOrigin(baseUrl) !== OFFICIAL_DEEPSEEK_ORIGIN) {return false;}
  return error instanceof DeepSeekApiError && (
    error.status === 404 ||
    error.status === 410 ||
    error.reason === "model_unavailable"
  );
}

export function buildFlashFallbackRequest(request: ChatRequest): { request: ChatRequest; imagesOmitted: number } {
  let imagesOmitted = 0;
  const messages = request.messages.map((message) => {
    if (!Array.isArray(message.content)) {return message;}
    const textParts = message.content.filter((part) => {
      const visual = part.type === "file" || part.type === "image_url";
      if (visual) {imagesOmitted += 1;}
      return !visual;
    });
    return { ...message, content: textParts.length > 0 ? textParts : "" };
  });

  return {
    request: {
      ...request,
      model: DEEPSEEK_FLASH_FALLBACK_MODEL_ID,
      messages: imagesOmitted > 0 ? appendVisualFallbackInstruction(messages, imagesOmitted) : messages,
    },
    imagesOmitted,
  };
}

export function requestContainsImages(request: ChatRequest): boolean {
  return request.messages.some((message) => Array.isArray(message.content) && message.content.some(
    (part) => part.type === "file" || part.type === "image_url",
  ));
}

function appendVisualFallbackInstruction(messages: ChatMessage[], imagesOmitted: number): ChatMessage[] {
  const instruction = [
    "<vision_fallback>",
    `The experimental DeepSeek Vision model is unavailable, so the transport continued with stable DeepSeek V4 Flash and omitted ${imagesOmitted} image attachment(s).`,
    "Do not infer or invent visual details. Continue only with work that does not require seeing those images, and briefly disclose the limitation in the language of the user's latest message.",
    "</vision_fallback>",
  ].join("\n");
  const systemIndex = messages.findIndex((message) => message.role === "system");
  if (systemIndex < 0) {
    return [{ role: "system", content: instruction }, ...messages];
  }
  return messages.map((message, index) => index === systemIndex
    ? { ...message, content: `${getTextContent(message.content)}\n\n${instruction}` }
    : message);
}
