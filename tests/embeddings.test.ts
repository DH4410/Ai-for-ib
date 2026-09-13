import { describe, expect, it } from "vitest";

import { createSelfHostedQueryEmbedder } from "@/lib/embeddings";

describe("self-hosted query embeddings", () => {
  it("uses the configured OpenAI-compatible endpoint without requiring a ChatGPT service", async () => {
    let request: Request | undefined;
    const embedQuery = createSelfHostedQueryEmbedder(
      {
        EMBEDDING_API_KEY: "local-key",
        EMBEDDING_BASE_URL: "http://localhost:8001/v1",
        EMBEDDING_MODEL: "BAAI/bge-m3",
      },
      async (input, init) => {
        request = new Request(input, init);
        return Response.json({ data: [{ embedding: [0.1, 0.2] }] });
      },
    );

    await expect(embedQuery("specific latent heat")).resolves.toEqual([0.1, 0.2]);
    expect(request?.url).toBe("http://localhost:8001/v1/embeddings");
    expect(request?.headers.get("Authorization")).toBe("Bearer local-key");
  });
});
