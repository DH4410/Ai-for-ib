import { describe, expect, it } from "vitest";

import { buildCapabilityHealth } from "@/lib/health";

describe("capability health", () => {
  it("reports configured capabilities without exposing any secret values", () => {
    const result = buildCapabilityHealth({
      EMBEDDING_BASE_URL: "http://localhost:8001/v1",
      EMBEDDING_MODEL: "BAAI/bge-m3",
      MODEL_BASE_URL: "http://localhost:8000/v1",
      MODEL_NAME: "Dima-IB-Tutor-v1",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_example",
      SUPABASE_SECRET_KEY: "sb_secret_private",
      SUPABASE_URL: "https://example.supabase.co",
    });

    expect(result).toMatchObject({
      auth: { configured: true },
      embeddings: { configured: true },
      model: {
        configured: true,
        mode: "self-hosted",
      },
      progress: { configured: true },
      realPastPapers: { configured: true },
      retrieval: { configured: true },
      serverDatabaseKey: "secret",
    });
    expect(JSON.stringify(result)).not.toContain(
      "sb_secret_private",
    );
  });

  it("distinguishes mock development from missing services", () => {
    expect(
      buildCapabilityHealth({
        USE_MOCK_MODEL: "true",
      }),
    ).toMatchObject({
      auth: { configured: false },
      embeddings: { configured: false },
      model: {
        configured: true,
        mode: "mock",
      },
      progress: { configured: false },
      retrieval: { configured: false },
      serverDatabaseKey: "missing",
    });
  });
});
