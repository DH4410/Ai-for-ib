import { describe, expect, it } from "vitest";

import {
  parseEvaluationCase,
  type EvaluationCase,
} from "@/training/evaluation";
import {
  auditTrainingSplit,
  auditPromptOverlap,
  auditValidationSplit,
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
  it("detects identical learner tasks with different system messages and IDs", () => {
    const a = trainExample("physics-learn-001", "physics", "learn", "Solve x + 2 = 0.");
    const b = evaluationCase("physics-mark-002", "physics", "mark", "Solve x + 2 = 0.");
    b.prompt[0].content = "Only give hints.";
    expect(auditPromptOverlap([a], [b]).exactPromptOverlaps).toHaveLength(1);
  });

  it("preserves notation and prior assistant context in exact matches", () => {
    const a = trainExample("physics-learn-001", "physics", "learn", "Find 10^-3.");
    const b = evaluationCase("physics-learn-002", "physics", "learn", "Find 10^3.");
    expect(auditPromptOverlap([a], [b]).exactPromptOverlaps).toEqual([]);
    a.prompt = [{ role: "assistant", content: "Use 2 kg." }, { role: "user", content: "What is the answer?" }];
    b.prompt = [{ role: "assistant", content: "Use 5 kg." }, { role: "user", content: "What is the answer?" }];
    expect(auditPromptOverlap([a], [b]).exactPromptOverlaps).toEqual([]);
  });

  it("audits validation against both the train and benchmark splits", () => {
    const a = trainExample("physics-learn-001", "physics", "learn", "Explain thermal equilibrium.");
    const v = trainExample("physics-learn-002", "physics", "learn", "Explain thermal equilibrium.");
    const w = trainExample("chemistry-mark-001", "chemistry", "mark", "Explain ionic bonding.");
    const b = evaluationCase("chemistry-mark-002", "chemistry", "mark", "Explain ionic bonding.");
    const result = auditValidationSplit([a], [v, w], [b]);
    expect(hasTrainingSplitLeakage(result.trainValidation)).toBe(true);
    expect(result.validationBenchmark?.exactPromptOverlaps).toEqual([
      { evalId: b.id, trainId: w.id, similarity: 1 },
    ]);
    expect(hasTrainingSplitLeakage(auditTrainingSplit([a], [b]))).toBe(false);
    expect(auditValidationSplit([a], [v]).validationBenchmark).toBeUndefined();
  });

  it("rejects invalid thresholds", () => {
    for (const threshold of [NaN, Infinity, 0, -1, 1.01]) {
      expect(() => auditPromptOverlap([], [], threshold)).toThrow("near prompt threshold");
    }
  });

});
