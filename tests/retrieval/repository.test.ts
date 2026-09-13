import { describe, expect, it } from "vitest";

import { InMemoryStudySourceRepository } from "@/lib/retrieval/repository";

const physicsChunk = {
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
};

const chemistryChunk = {
  documentId: "chemistry-pearson-2025",
  documentType: "textbook" as const,
  id: "chemistry-s1-p43",
  locator: "Structure 1 — p. 43",
  pageEnd: 43,
  pageStart: 43,
  subject: "chemistry" as const,
  text: "Latent heat can be discussed in a chemistry context.",
  title: "Chemistry Course Book",
  topicIds: ["chemistry.structure.models"],
};

describe("study source repository", () => {
  it("applies subject and document-type filters before lexical ranking", async () => {
    const repository = new InMemoryStudySourceRepository([physicsChunk, chemistryChunk]);

    const result = await repository.searchLexical({
      documentTypes: ["textbook"],
      limit: 5,
      query: "latent heat",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual(["physics-b1-p43"]);
  });
});
