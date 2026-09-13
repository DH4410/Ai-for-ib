export type OpenAICompatibleEmbeddingConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

type FetchImplementation = typeof fetch;

type EmbeddingRow = {
  embedding?: unknown;
  index?: unknown;
};

function validateConfig(config: OpenAICompatibleEmbeddingConfig): void {
  if (!config.baseUrl.trim()) throw new Error("embedding base URL is required");
  if (!config.model.trim()) throw new Error("embedding model is required");
}

function parseEmbedding(row: EmbeddingRow, label: string): number[] {
  if (
    !Array.isArray(row.embedding) ||
    row.embedding.length === 0 ||
    row.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`embedding server returned an invalid vector for ${label}`);
  }
  return row.embedding;
}

export function createOpenAICompatibleBatchEmbedder(
  config: OpenAICompatibleEmbeddingConfig,
  fetchImplementation: FetchImplementation = fetch,
): (texts: string[]) => Promise<number[][]> {
  validateConfig(config);
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  return async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return [];
    if (texts.some((text) => !text.trim())) {
      throw new Error("embedding input must contain non-empty text");
    }

    const response = await fetchImplementation(`${baseUrl}/embeddings`, {
      body: JSON.stringify({ input: texts, model: config.model }),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Embedding server returned ${response.status}.`);
    }

    const payload = (await response.json()) as { data?: EmbeddingRow[] };
    if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
      throw new Error("embedding server returned the wrong number of vectors");
    }

    const rows = payload.data.map((row, position) => {
      const index =
        Number.isSafeInteger(row.index) &&
        (row.index as number) >= 0 &&
        (row.index as number) < texts.length
          ? (row.index as number)
          : position;
      return {
        embedding: parseEmbedding(row, `input ${position + 1}`),
        index,
      };
    });

    const seen = new Set(rows.map(({ index }) => index));
    if (seen.size !== rows.length) {
      throw new Error("embedding server returned duplicate vector indexes");
    }

    return rows
      .sort((left, right) => left.index - right.index)
      .map(({ embedding }) => embedding);
  };
}
