import { describe, expect, it } from "vitest";

import {
  buildPastPaperQuestionRecords,
} from "@/lib/past-papers/records";

const questionDocument = {
  documentKind: "question-paper" as const,
  id: "physics-m25-hl-tz2-p2-qp",
  language: "English",
  level: "HL" as const,
  paper: "p2",
  session: "may" as const,
  subject: "physics" as const,
  syllabusVersion: "2025",
  timezone: "TZ2",
  year: 2025,
};

const markschemeDocument = {
  ...questionDocument,
  documentKind: "markscheme" as const,
  id: "physics-m25-hl-tz2-p2-ms",
};

describe("structured past-paper records", () => {
  it("pairs matching question/subquestion candidates conservatively", () => {
    const result = buildPastPaperQuestionRecords({
      markschemeDocument,
      markschemePages: [
        {
          pageNumber: 1,
          text: [
            "1. Accept energy transferred during a state change.",
            "(a) Award for use of latent heat. [2]",
          ].join("\n"),
        },
      ],
      questionDocument,
      questionPages: [
        {
          pageNumber: 3,
          text: [
            "1. State what is meant by specific latent heat.",
            "(a) Calculate the energy transferred. [2]",
          ].join("\n"),
        },
      ],
    });

    expect(result.questions).toEqual([
      expect.objectContaining({
        commandTerms: ["state"],
        id: "physics-m25-hl-tz2-p2-qp-q1",
        markschemeText:
          "Accept energy transferred during a state change.",
        pairingStatus: "paired",
        questionNumber: "1",
      }),
      expect.objectContaining({
        commandTerms: ["calculate"],
        id: "physics-m25-hl-tz2-p2-qp-q1a",
        marks: 2,
        markschemeText:
          "Award for use of latent heat. [2]",
        pairingStatus: "paired",
        questionNumber: "1",
        subquestion: "a",
      }),
    ]);
  });

  it("keeps unmatched questions question_only instead of inventing a markscheme", () => {
    const result = buildPastPaperQuestionRecords({
      questionDocument,
      questionPages: [
        {
          pageNumber: 2,
          text: "2. Determine the gradient. [1]",
        },
      ],
    });

    expect(result.questions[0]).toMatchObject({
      markschemeText: null,
      pairingStatus: "question_only",
    });
  });

  it("flags questions that depend on a missing visual asset", () => {
    const result = buildPastPaperQuestionRecords({
      questionDocument,
      questionPages: [
        {
          pageNumber: 5,
          text: "3. Use the graph shown below to determine the gradient. [2]",
        },
      ],
    });

    expect(result.questions[0]?.assetReferences).toEqual([
      "visual-context-required",
    ]);
  });

  it("rejects a markscheme whose full metadata key does not match", () => {
    expect(() =>
      buildPastPaperQuestionRecords({
        markschemeDocument: {
          ...markschemeDocument,
          timezone: "TZ1",
        },
        markschemePages: [
          { pageNumber: 1, text: "1. Award 1 mark." },
        ],
        questionDocument,
        questionPages: [
          { pageNumber: 1, text: "1. State a fact." },
        ],
      }),
    ).toThrow("does not uniquely match");
  });
});
