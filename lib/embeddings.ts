import "server-only";

import {
  createOpenAICompatibleBatchEmbedder,
  type OpenAICompatibleEmbeddingConfig,
} from "@/lib/embedding-client";

export type EmbeddingEnvironment = {
  [name: string]: string | undefined;
  EMBEDDING_BASE_URL?: string;
  EMBEDDING_MODEL?: string;
  EMBEDDING_API_KEY?: string;
};

type FetchImplementation = typeof fetch;

export function isEmbeddingConfigured(environment: EmbeddingEnvironment): boolean {
  return Boolean(environment.EMBEDDING_BASE_URL?.trim() && environment.EMBEDDING_MODEL?.trim());
}

function configurationFromEnvironment(
  environment: EmbeddingEnvironment,
): OpenAICompatibleEmbeddingConfig {
  if (!isEmbeddingConfigured(environment)) {
    throw new Error(
      "Query embeddings are not configured. Set EMBEDDING_BASE_URL and EMBEDDING_MODEL on the server.",
    );
  }

  return {
    apiKey: environment.EMBEDDING_API_KEY ?? "",
    baseUrl: environment.EMBEDDING_BASE_URL!,
    model: environment.EMBEDDING_MODEL!,
  };
}

export function createSelfHostedBatchEmbedder(
  environment: EmbeddingEnvironment = process.env,
  fetchImplementation: FetchImplementation = fetch,
): (texts: string[]) => Promise<number[][]> {
  return createOpenAICompatibleBatchEmbedder(
    configurationFromEnvironment(environment),
    fetchImplementation,
  );
}

export function createSelfHostedQueryEmbedder(
  environment: EmbeddingEnvironment = process.env,
  fetchImplementation: FetchImplementation = fetch,
): (query: string) => Promise<number[]> {
  const embedBatch = createSelfHostedBatchEmbedder(environment, fetchImplementation);
  return async (query: string): Promise<number[]> => {
    const [embedding] = await embedBatch([query]);
    return embedding;
  };
}
