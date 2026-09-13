import { describe, expect, it } from "vitest";

import { createOpenAICompatibleBatchEmbedder } from "@/lib/embedding-client";

describe("OpenAI-compatible batch embeddings", () => {
  it("preserves input order when indexed rows arrive out of order", async () => {
    let requestBody: unknown;
    const embed = createOpenAICompatibleBatchEmbedder(
      {
        apiKey: "private-key",
        baseUrl: "http://localhost:8001/v1/",
        model: "BAAI/bge-m3",
      },
      async (input, init) => {
        requestBody = JSON.parse(String(init?.body));
        expect(String(input)).toBe("http://localhost:8001/v1/embeddings");
        return Response.json({
          data: [
            { embedding: [0.3, 0.4], index: 1 },
            { embedding: [0.1, 0.2], index: 0 },
          ],
        });
      },
    );

    await expect(embed(["first chunk", "second chunk"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(requestBody).toEqual({
      input: ["first chunk", "second chunk"],
      model: "BAAI/bge-m3",
    });
  });

  it("rejects a mismatched vector count", async () => {
    const embed = createOpenAICompatibleBatchEmbedder(
      { baseUrl: "http://localhost:8001/v1", model: "test" },
      async () => Response.json({ data: [] }),
    );

    await expect(embed(["one"])).rejects.toThrow("wrong number of vectors");
  });
});
