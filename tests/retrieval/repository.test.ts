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

const pastPapers = [
  {
    documentId: "physics-m25-p2",
    id: "physics-m25-p2-q4",
    locator: "May 2025 · HL · P2 · Q4",
    marks: 6,
    markschemeText: "Award marks for energy balance and correct units.",
    pairingStatus: "paired" as const,
    paper: "P2",
    questionNumber: "4",
    questionText: "A sample owned Physics thermal-energy question.",
    score: 0.6,
    subject: "physics" as const,
    title: "Physics May 2025 HL Paper 2",
    topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
    year: 2025,
  },
  {
    documentId: "physics-m24-p1a",
    id: "physics-m24-p1a-q1",
    locator: "May 2024 · HL · P1A · Q1",
    marks: 1,
    markschemeText: null,
    pairingStatus: "question_only" as const,
    paper: "P1A",
    questionNumber: "1",
    questionText: "A sample owned Physics mechanics question.",
    score: 0.9,
    subject: "physics" as const,
    title: "Physics May 2024 HL Paper 1A",
    topicIds: ["physics.a.space-time-motion"],
    year: 2024,
  },
];

describe("study source repository", () => {
  it("applies subject and document-type filters before lexical ranking", async () => {
    const repository = new InMemoryStudySourceRepository([
      physicsChunk,
      chemistryChunk,
    ]);

    const result = await repository.searchLexical({
      documentTypes: ["textbook"],
      limit: 5,
      query: "latent heat",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-b1-p43",
    ]);
  });

  it("applies real paper, year, topic and paired-only filters before ranking", async () => {
    const repository = new InMemoryStudySourceRepository(
      [],
      pastPapers,
    );

    const result = await repository.searchPastPaperQuestions({
      limit: 5,
      pairedOnly: true,
      paper: "p2",
      query: "thermal energy",
      subject: "physics",
      topicIds: [
        "physics.b.particulate-matter.specific-latent-heat",
      ],
      years: [2025],
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
  });
});
