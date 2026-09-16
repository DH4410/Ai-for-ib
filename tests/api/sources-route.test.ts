import { describe, expect, it, vi } from "vitest";

import { createSourceCatalogGetHandler } from "@/app/api/sources/route";
import { AuthenticationError } from "@/lib/auth/request-user";
import {
  InMemoryStudySourceCatalogRepository,
} from "@/lib/sources/repository";

const sources = [
  {
    chunkCount: 145,
    documentType: "textbook" as const,
    latestAcquiredAt: "2026-09-13T18:00:00.000Z",
    pairedQuestionCount: 0,
    questionCount: 0,
    sourceId: "physics-oxford-2023",
    subject: "physics" as const,
    title: "Physics Course Companion",
    versionCount: 1,
  },
  {
    chunkCount: 0,
    documentType: "question-paper" as const,
    latestAcquiredAt: "2026-09-13T19:00:00.000Z",
    pairedQuestionCount: 15,
    questionCount: 18,
    sourceId: "physics-m25-hl-tz2-p2-qp",
    subject: "physics" as const,
    title: "Physics May 2025 HL TZ2 P2",
    versionCount: 1,
  },
];

describe("source catalog API", () => {
  it("returns only safe source summary metadata after authentication", async () => {
    const handler = createSourceCatalogGetHandler({
      repository:
        new InMemoryStudySourceCatalogRepository(sources),
      resolveUserId: async () =>
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const response = await handler(
      new Request(
        "http://localhost/api/sources?subject=physics",
        {
          headers: {
            Authorization: "Bearer valid",
          },
        },
      ),
    );
    const body = (await response.json()) as {
      sources: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[1]).toMatchObject({
      pairedQuestionCount: 15,
      questionCount: 18,
    });
    for (const source of body.sources) {
      expect(source).not.toHaveProperty("sourceReference");
      expect(source).not.toHaveProperty("source_reference");
      expect(source).not.toHaveProperty("storagePath");
      expect(source).not.toHaveProperty("storage_path");
      expect(source).not.toHaveProperty("text");
      expect(source).not.toHaveProperty("content");
    }
  });

  it("does not query source metadata before authentication succeeds", async () => {
    const repository =
      new InMemoryStudySourceCatalogRepository(sources);
    const listSources = vi.spyOn(
      repository,
      "listSources",
    );
    const handler = createSourceCatalogGetHandler({
      repository,
      resolveUserId: async () => {
        throw new AuthenticationError("sign in required");
      },
    });

    const response = await handler(
      new Request("http://localhost/api/sources"),
    );

    expect(response.status).toBe(401);
    expect(listSources).not.toHaveBeenCalled();
  });
});
