import { describe, expect, it } from "vitest";

import {
  parseEvaluationCase,
  parseEvaluationJsonl,
  scoreEvaluationResponse,
} from "@/training/evaluation";

const validCase = {
  id: "chemistry-rate-001",
  subject: "chemistry",
  mode: "mark",
  prompt: [
    {
      role: "user",
      content: "Why does increasing temperature usually increase reaction rate?",
    },
  ],
  rubric: {
    requiredConceptGroups: [
      ["kinetic energy"],
      ["collision frequency", "collisions happen more often"],
      ["activation energy", "enough energy to react"],
    ],
    forbiddenPhrases: ["because it just does"],
    maxWords: 120,
    shouldAskLearnerQuestion: false,
  },
};

describe("private model evaluation", () => {
  it("parses a structured evaluation case", () => {
    expect(parseEvaluationCase(validCase)).toEqual(validCase);
  });

  it("validates optional benchmark topic metadata", () => {
    expect(
      parseEvaluationCase({
        ...validCase,
        topicIds: [
          "chemistry.reactivity.amount-rate-extent.rate",
        ],
      }),
    ).toMatchObject({
      topicIds: [
        "chemistry.reactivity.amount-rate-extent.rate",
      ],
    });

    expect(() =>
      parseEvaluationCase({
        ...validCase,
        topicIds: [
          "mathematics.functions",
        ],
      }),
    ).toThrow(
      "contains a mathematics topic for a chemistry benchmark case",
    );
  });

  it("reports line numbers and duplicate ids", () => {
    const line = JSON.stringify(validCase);

    expect(() => parseEvaluationJsonl(`${line}\n{bad}`)).toThrow(
      "invalid evaluation JSON on line 2",
    );
    expect(() => parseEvaluationJsonl(`${line}\n${line}`)).toThrow(
      "duplicate evaluation case id",
    );
  });

  it("scores deterministic concept and guardrail checks without pretending to judge correctness", () => {
    const result = scoreEvaluationResponse(
      "Particles have more kinetic energy, so collisions happen more often and more collisions have enough energy to react.",
      validCase.rubric,
    );

    expect(result).toMatchObject({
      conceptGroupsMatched: 3,
      conceptGroupsTotal: 3,
      conceptCoverage: 1,
      forbiddenHits: [],
      withinWordLimit: true,
      guardrailsPassed: true,
    });
  });

  it("checks expected numeric answers with tolerance and units without mistaking concept words for correctness", () => {
    const rubric = {
      ...validCase.rubric,
      numericExpectations: [
        {
          value: 3,
          absoluteTolerance: 0.01,
          unitPhrases: ["m/s²", "m s-2"],
        },
      ],
    };

    expect(
      scoreEvaluationResponse(
        "Using F = ma gives an acceleration of 3.00 m/s².",
        rubric,
      ),
    ).toMatchObject({
      numericExpectationsMatched: 1,
      numericExpectationsTotal: 1,
      numericCoverage: 1,
      numericChecksPassed: true,
    });

    const wrong = scoreEvaluationResponse(
      "Using F = ma gives an acceleration of 4.00 m/s².",
      rubric,
    );
    expect(wrong.numericCoverage).toBe(0);
    expect(wrong.numericChecksPassed).toBe(false);
    expect(wrong.correctnessCoverage).toBeLessThan(
      wrong.conceptCoverage,
    );
  });

  it("detects forbidden phrases, excessive length and a missing learner question", () => {
    const result = scoreEvaluationResponse(
      `Because it just does. ${"word ".repeat(130)}`,
      {
        ...validCase.rubric,
        shouldAskLearnerQuestion: true,
      },
    );

    expect(result.forbiddenHits).toEqual(["because it just does"]);
    expect(result.withinWordLimit).toBe(false);
    expect(result.learnerQuestionRequirementPassed).toBe(false);
    expect(result.guardrailsPassed).toBe(false);
  });
});
