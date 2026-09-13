import { describe, expect, it } from "vitest";

import { extractQuestionCandidates } from "@/lib/past-papers/questions";

describe("past-paper question candidates", () => {
  it("segments question and subquestion candidates with page locators and visible marks", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 4,
          text: [
            "1. State one property of the sample.",
            "(a) Explain the result. [2]",
            "(b) Calculate the final value. [3]",
            "2. Determine the gradient. [1]",
          ].join("\n"),
        },
      ],
      "physics-2025-may-tz2-p2",
    );

    expect(
      candidates.map(({ id, marks, pageEnd, pageStart, questionNumber, subquestion }) => ({
        id,
        marks,
        pageEnd,
        pageStart,
        questionNumber,
        subquestion,
      })),
    ).toEqual([
      {
        id: "physics-2025-may-tz2-p2-q1",
        marks: undefined,
        pageEnd: 4,
        pageStart: 4,
        questionNumber: "1",
        subquestion: undefined,
      },
      {
        id: "physics-2025-may-tz2-p2-q1a",
        marks: 2,
        pageEnd: 4,
        pageStart: 4,
        questionNumber: "1",
        subquestion: "a",
      },
      {
        id: "physics-2025-may-tz2-p2-q1b",
        marks: 3,
        pageEnd: 4,
        pageStart: 4,
        questionNumber: "1",
        subquestion: "b",
      },
      {
        id: "physics-2025-may-tz2-p2-q2",
        marks: 1,
        pageEnd: 4,
        pageStart: 4,
        questionNumber: "2",
        subquestion: undefined,
      },
    ]);
  });
});
