import { describe, expect, it } from "vitest";

import { createStudyRetriever } from "@/lib/retrieval";
import { InMemoryStudySourceRepository } from "@/lib/retrieval/repository";

const physicsB1 = {
  documentId: "physics-oxford-2023",
  documentType: "textbook" as const,
  id: "physics-b1-p43",
  locator: "Theme B.1 — p. 43",
  pageEnd: 43,
  pageStart: 43,
  subject: "physics" as const,
  text: "Specific latent heat is energy transferred during a state change.",
  title: "Physics Course Companion",
  topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
  vectorScore: 0.9,
};

const chemistryChunk = {
  ...physicsB1,
  id: "chemistry-s1-p43",
  subject: "chemistry" as const,
  title: "Chemistry Course Book",
};

describe("study retrieval façade", () => {
  it("returns only cited Physics passages when lexical and vector retrieval agree", async () => {
    const retrieve = createStudyRetriever({
      embedQuery: async () => [0.1, 0.2],
      repository: new InMemoryStudySourceRepository([physicsB1, chemistryChunk]),
    });

    await expect(
      retrieve({ limit: 3, query: "specific latent heat", subject: "physics" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "physics-b1-p43",
        locator: "Theme B.1 — p. 43",
        title: "Physics Course Companion",
      }),
    ]);
  });
});
