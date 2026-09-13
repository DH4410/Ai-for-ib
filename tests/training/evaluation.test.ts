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
