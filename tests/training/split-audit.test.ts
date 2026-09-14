import { describe, expect, it } from "vitest";

import {
  parseEvaluationCase,
  type EvaluationCase,
} from "@/training/evaluation";
import {
  auditTrainingSplit,
  EVAL_TARGET_PER_CORE_CELL,
  hasTrainingSplitLeakage,
  TRAIN_TARGET_PER_CORE_CELL,
} from "@/training/split-audit";
import {
  parseTrainingExample,
  type TrainingExample,
} from "@/training/schema";

function trainExample(
  id: string,
  subject: "physics" | "chemistry",
  mode: "learn" | "mark",
  user: string,
): TrainingExample {
  return parseTrainingExample({
    completion: [
      {
        role: "assistant",
        content: "Owned synthetic tutor answer.",
      },
    ],
    dataOrigin: "synthetic",
    id,
    mode,
    prompt: [
      {
        role: "system",
        content: "Act as an IB tutor.",
      },
      { role: "user", content: user },
    ],
    subject,
    tags: [],
  });
}

function evaluationCase(
  id: string,
  subject: "physics" | "chemistry",
  mode: "learn" | "mark",
  user: string,
): EvaluationCase {
  return parseEvaluationCase({
    id,
    mode,
    prompt: [
      {
        role: "system",
        content: "Act as an IB tutor.",
      },
      { role: "user", content: user },
    ],
    rubric: {
      forbiddenPhrases: [],
      requiredConceptGroups: [["energy"]],
      shouldAskLearnerQuestion: false,
    },
    subject,
  });
}

describe("training split audit", () => {
  it("accepts the real rubric-based eval schema and detects near prompt leakage", () => {
    const train = [
      trainExample(
        "physics-learn-001",
        "physics",
        "learn",
        "Explain specific latent heat using an everyday example and then ask me a question.",
      ),
    ];
    const evaluation = [
      evaluationCase(
        "physics-learn-002",
        "physics",
        "learn",
        "Explain specific latent heat using an everyday example, then ask me a question.",
      ),
    ];

    const audit = auditTrainingSplit(
      train,
      evaluation,
      0.8,
    );

    expect(audit.nearPromptOverlaps).toEqual([
      expect.objectContaining({
        evalId: "physics-learn-002",
        trainId: "physics-learn-001",
      }),
    ]);
    expect(hasTrainingSplitLeakage(audit)).toBe(
      true,
    );
  });

  it("reports coverage gaps and non-blocking target shortfalls", () => {
    const train = [
      trainExample(
        "physics-learn-001",
        "physics",
        "learn",
        "Teach me specific latent heat from the beginning.",
      ),
    ];
    const evaluation = [
      evaluationCase(
        "chemistry-mark-001",
        "chemistry",
        "mark",
        "Mark my explanation of collision theory.",
      ),
    ];

    const audit = auditTrainingSplit(
      train,
      evaluation,
    );

    expect(hasTrainingSplitLeakage(audit)).toBe(
      false,
    );
    expect(audit.trainCoverageGaps).toContain(
      "chemistry:mark",
    );
    expect(audit.evalCoverageGaps).toContain(
      "physics:learn",
    );
    expect(
      audit.trainCoverageShortfalls.find(
        ({ cell }) => cell === "physics:learn",
      ),
    ).toMatchObject({
      count: 1,
      missing: TRAIN_TARGET_PER_CORE_CELL - 1,
      target: TRAIN_TARGET_PER_CORE_CELL,
    });
    expect(
      audit.evalCoverageShortfalls.find(
        ({ cell }) => cell === "chemistry:mark",
      ),
    ).toMatchObject({
      count: 1,
      missing: EVAL_TARGET_PER_CORE_CELL - 1,
      target: EVAL_TARGET_PER_CORE_CELL,
    });
  });
});
