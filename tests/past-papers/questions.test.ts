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
      candidates.map(
        ({
          id,
          marks,
          pageEnd,
          pageStart,
          questionNumber,
          subquestion,
        }) => ({
          id,
          marks,
          pageEnd,
          pageStart,
          questionNumber,
          subquestion,
        }),
      ),
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

  it("preserves parent context for nested letter and roman subquestions", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 6,
          text: [
            "1. A block is heated at constant power.",
            "The mass of the block is 0.50 kg.",
            "(a) The temperature rises steadily.",
            "(i) State the energy transfer involved. [1]",
            "(ii) Calculate the energy supplied. [2]",
            "(b) Suggest one source of uncertainty. [1]",
          ].join("\n"),
        },
      ],
      "physics-m25-p2",
    );

    const romanOne = candidates.find(
      ({ subquestion }) => subquestion === "a.i",
    );
    const romanTwo = candidates.find(
      ({ subquestion }) => subquestion === "a.ii",
    );

    expect(
      candidates.map(({ id }) => id),
    ).toContain("physics-m25-p2-q1a.i");
    expect(
      candidates.map(({ id }) => id),
    ).toContain("physics-m25-p2-q1a.ii");
    expect(romanOne?.text).toContain(
      "A block is heated at constant power.",
    );
    expect(romanOne?.text).toContain(
      "The temperature rises steadily.",
    );
    expect(romanOne?.text).toContain(
      "State the energy transfer involved. [1]",
    );
    expect(romanTwo?.marks).toBe(2);
  });

  it("does not prepend an independent top-level command to later letter parts", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 4,
          text: [
            "1. State one property of the sample.",
            "(a) Explain the result. [2]",
          ].join("\n"),
        },
      ],
      "physics-m25-p2",
    );

    expect(
      candidates.find(
        ({ subquestion }) => subquestion === "a",
      )?.text,
    ).toBe("Explain the result. [2]");
  });

  it("parses compact markscheme-table identifiers", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 10,
          text: [
            "1 a i Award one mark for conservation of energy. [1]",
            "1 a ii Accept 4200 J with working. [2]",
          ].join("\n"),
        },
      ],
      "physics-m25-p2-ms",
    );

    expect(
      candidates.map(
        ({ subquestion, marks, text }) => ({
          marks,
          subquestion,
          text,
        }),
      ),
    ).toEqual([
      {
        marks: 1,
        subquestion: "a.i",
        text: "Award one mark for conservation of energy. [1]",
      },
      {
        marks: 2,
        subquestion: "a.ii",
        text: "Accept 4200 J with working. [2]",
      },
    ]);
  });

  it("parses a combined question-number and letter marker", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 2,
          text: "3. (a) Calculate the momentum. [2]",
        },
      ],
      "physics-m25-p2",
    );

    expect(candidates[0]).toMatchObject({
      id: "physics-m25-p2-q3a",
      marks: 2,
      questionNumber: "3",
      subquestion: "a",
    });
  });

  it("treats sequential (h) then (i) as letter parts rather than inventing a roman child", () => {
    const candidates = extractQuestionCandidates(
      [
        {
          pageNumber: 8,
          text: [
            "4. Long multipart question.",
            "(h) State one reason.",
            "(i) State another reason.",
          ].join("\n"),
        },
      ],
      "chemistry-m25-p2",
    );

    expect(
      candidates.map(({ subquestion }) => subquestion),
    ).toEqual([undefined, "h", "i"]);
  });
});
