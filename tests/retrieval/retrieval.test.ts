import { describe, expect, it, vi } from "vitest";

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
  locator: "May 2025 · TZ2 · HL · P2 · Q4",
  level: "HL" as const,
  session: "may" as const,
  timezone: "TZ2",
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

  it("uses canonical labels for focused lexical search while preserving learner wording for embeddings", async () => {
    const repository =
      new InMemoryStudySourceRepository([
        physicsB1,
      ]);
    const lexical = vi.spyOn(
      repository,
      "searchLexical",
    );
    let embeddedQuery = "";
    const retrieve = createStudyRetriever({
      embedQuery: async (query) => {
        embeddedQuery = query;
        return [0.1, 0.2];
      },
      repository,
    });

    const learnerQuery =
      "Teach me this from the beginning.";
    const result = await retrieve({
      filters: {
        topicIds: [
          "physics.b.particulate-matter.specific-latent-heat",
        ],
      },
      mode: "learn",
      query: learnerQuery,
      subject: "physics",
    });

    expect(
      result.map(({ id }) => id),
    ).toEqual(["physics-b1-p43"]);
    expect(lexical).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Specific latent heat",
      }),
    );
    expect(embeddedQuery).toContain(
      learnerQuery,
    );
    expect(embeddedQuery).toContain(
      "Specific latent heat",
    );
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
        level: "HL",
        paper: "p2",
        realPastPapersOnly: true,
        session: "may",
        timezone: "TZ2",
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

  it("does not mix sessions or timezones into an exact paper search", async () => {
    const retrieve = createStudyRetriever({
      repository: new InMemoryStudySourceRepository(
        [],
        [
          pairedQuestion,
          {
            ...pairedQuestion,
            id: "physics-n25-tz2-p2-q4",
            locator:
              "November 2025 · TZ2 · HL · P2 · Q4",
            session: "november",
            score: 0.99,
          },
          {
            ...pairedQuestion,
            id: "physics-m25-tz1-p2-q4",
            locator:
              "May 2025 · TZ1 · HL · P2 · Q4",
            timezone: "TZ1",
            score: 0.98,
          },
        ],
      ),
    });

    const result = await retrieve({
      filters: {
        level: "HL",
        paper: "p2",
        realPastPapersOnly: true,
        session: "may",
        timezone: "TZ2",
        years: [2025],
      },
      mode: "practice",
      query: "thermal energy",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
    expect(result[0]).toMatchObject({
      level: "HL",
      session: "may",
      timezone: "TZ2",
    });
  });

  it("does not mix SL questions into an HL paper search", async () => {
    const retrieve = createStudyRetriever({
      repository: new InMemoryStudySourceRepository(
        [],
        [
          pairedQuestion,
          {
            ...pairedQuestion,
            id: "physics-m25-sl-p2-q4",
            level: "SL",
            locator: "May 2025 · SL · P2 · Q4",
            score: 0.99,
          },
        ],
      ),
    });

    const result = await retrieve({
      filters: {
        level: "HL",
        realPastPapersOnly: true,
      },
      mode: "practice",
      query: "thermal energy",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
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
    expect(
      result[0]?.markschemeAvailable,
    ).toBe(true);
  });

  it("filters real practice to paired questions when an official scheme is required", async () => {
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
            score: 0.99,
          },
        ],
      ),
    });

    const result = await retrieve({
      filters: {
        documentTypes: ["question-paper"],
        realPastPapersOnly: true,
        requireMarkscheme: true,
      },
      mode: "practice",
      query: "thermal energy",
      subject: "physics",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "physics-m25-p2-q4",
    ]);
    expect(result[0]?.pairingStatus).toBe("paired");
    expect(result[0]?.text).not.toContain(
      "Official markscheme",
    );
    expect(
      result[0]?.markschemeAvailable,
    ).toBe(false);
  });
});
