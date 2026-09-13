import "server-only";

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

export function createSelfHostedQueryEmbedder(
  environment: EmbeddingEnvironment = process.env,
  fetchImplementation: FetchImplementation = fetch,
): (query: string) => Promise<number[]> {
  if (!isEmbeddingConfigured(environment)) {
    throw new Error(
      "Query embeddings are not configured. Set EMBEDDING_BASE_URL and EMBEDDING_MODEL on the server.",
    );
  }

  const baseUrl = environment.EMBEDDING_BASE_URL!.replace(/\/$/, "");
  const model = environment.EMBEDDING_MODEL!;
  const apiKey = environment.EMBEDDING_API_KEY ?? "";

  return async (query: string): Promise<number[]> => {
    const response = await fetchImplementation(`${baseUrl}/embeddings`, {
      body: JSON.stringify({ input: query, model }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Embedding server returned ${response.status}.`);
    }

    const payload = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    const embedding = payload.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error("Embedding server returned an invalid vector.");
    }

    return embedding;
  };
}
