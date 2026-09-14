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

const pairedQuestion = {
  documentId: "physics-m25-p2",
  id: "physics-m25-p2-q4",
  locator: "May 2025 · HL · P2 · Q4",
  marks: 6,
  markschemeText: "Official owned-fixture markscheme text.",
  pairingStatus: "paired" as const,
  paper: "P2",
  questionNumber: "4",
  questionText: "Owned-fixture question text about thermal energy.",
  score: 0.8,
  subject: "physics" as const,
  title: "Physics May 2025 HL Paper 2",
  topicIds: [
    "physics.b.particulate-matter.specific-latent-heat",
  ],
  year: 2025,
};

describe("study retrieval façade", () => {
  it("returns only cited Physics passages when lexical and vector retrieval agree", async () => {
    const retrieve = createStudyRetriever({
      embedQuery: async () => [0.1, 0.2],
      repository: new InMemoryStudySourceRepository([
        physicsB1,
        chemistryChunk,
      ]),
    });

    await expect(
      retrieve({
        limit: 3,
        query: "specific latent heat",
        subject: "physics",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "physics-b1-p43",
        locator: "Theme B.1 — p. 43",
        title: "Physics Course Companion",
      }),
    ]);
  });

  it("honours real Paper 2/year filters and hides the markscheme during practice", async () => {
    const retrieve = createStudyRetriever({
      repository: new InMemoryStudySourceRepository(
        [],
        [pairedQuestion],
      ),
    });

    const result = await retrieve({
      filters: {
        paper: "p2",
        realPastPapersOnly: true,
        years: [2025],
      },
      mode: "practice",
      query: "Give me a thermal-energy question",
      subject: "physics",
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "physics-m25-p2-q4",
        marks: 6,
        paper: "P2",
        questionNumber: "4",
        year: 2025,
      }),
    ]);
    expect(result[0]?.text).toContain(
      "Owned-fixture question text",
    );
    expect(result[0]?.text).not.toContain(
      "Official owned-fixture markscheme text",
    );
  });

  it("requires a paired paper and includes its official markscheme in mark mode", async () => {
    const retrieve = createStudyRetriever({
      repository: new InMemoryStudySourceRepository(
        [],
        [
          pairedQuestion,
          {
            ...pairedQuestion,
            id: "physics-m25-p2-q5",
            markschemeText: null,
            pairingStatus: "question_only",
            questionNumber: "5",
          },
        ],
      ),
    });

    const result = await retrieve({
      filters: {
        documentTypes: ["question-paper"],
        paper: "p2",
        years: [2025],
      },
      mode: "mark",
      query: "thermal energy",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
    expect(result[0]?.text).toContain(
      "Official markscheme",
    );
  });

  it("pins an exact selected question and includes its official scheme only in mark mode", async () => {
    const retrieve = createStudyRetriever({
      repository: new InMemoryStudySourceRepository(
        [],
        [
          pairedQuestion,
          {
            ...pairedQuestion,
            id: "physics-m25-p2-q9",
            questionNumber: "9",
            questionText: "Different fixture question.",
          },
        ],
      ),
    });

    const result = await retrieve({
      filters: {
        pastPaperQuestionId: "physics-m25-p2-q4",
      },
      mode: "mark",
      query:
        "This answer text deliberately does not resemble the question.",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
    expect(result[0]?.text).toContain(
      "Official owned-fixture markscheme text",
    );
  });
});
