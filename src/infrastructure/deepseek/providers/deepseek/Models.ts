import { deepseekFetch } from "@/infrastructure/deepseek/client/DeepSeekFetch";
import { buildModelsUrl } from "@/infrastructure/deepseek/endpoints/DeepSeekEndpoints";
import { MAX_METADATA_RESPONSE_BYTES, readBoundedJson } from "@/infrastructure/deepseek/client/BoundedResponseJson";

export interface DeepSeekModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export async function listModels(apiKey: string, baseUrl: string): Promise<DeepSeekModel[]> {
  const url = buildModelsUrl(baseUrl);
  const response = await deepseekFetch({ pathOrUrl: url, apiKey, baseUrl });
  const data = await readBoundedJson(response, MAX_METADATA_RESPONSE_BYTES) as { data: DeepSeekModel[] };
  return data.data || [];
}

export async function getModel(modelId: string, apiKey: string, baseUrl: string): Promise<DeepSeekModel | null> {
  const url = `${buildModelsUrl(baseUrl)}/${modelId}`;
  try {
    const response = await deepseekFetch({ pathOrUrl: url, apiKey, baseUrl });
    const data = await readBoundedJson(response, MAX_METADATA_RESPONSE_BYTES) as { data?: DeepSeekModel };
    return data.data || null;
  } catch {
    return null;
  }
}
