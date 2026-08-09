import { buildApiUrl } from "../client/DeepSeekFetch";

export function buildChatUrl(baseUrl: string): string {
  return buildApiUrl(baseUrl, "chat/completions");
}

export function buildModelsUrl(baseUrl: string): string {
  return buildApiUrl(baseUrl, "models");
}

export function buildFimUrl(baseUrl: string): string {
  return buildApiUrl(baseUrl, "completions");
}

export function buildBalanceUrl(baseUrl: string): string {
  return buildApiUrl(baseUrl, "user/balance");
}
