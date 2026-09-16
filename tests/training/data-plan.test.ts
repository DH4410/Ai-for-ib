import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildDataCollectionPlan,
} from "@/training/data-plan";
import {
  parseEvaluationCase,
} from "@/training/evaluation";
import {
  parseTrainingExample,
} from "@/training/schema";

describe("training data collection plan", () => {
  it("prioritizes zero-coverage cells and keeps topic diversity advisory", () => {
    const train = [
      parseTrainingExample({
        completion: [
          {
            role: "assistant",
            content: "Synthetic answer.",
          },
        ],
        dataOrigin: "synthetic",
        id: "physics-learn-001",
        mode: "learn",
        prompt: [
          {
            role: "user",
            content:
              "Teach specific latent heat.",
          },
        ],
        subject: "physics",
        tags: [],
        topicIds: [
          "physics.b.particulate-matter.specific-latent-heat",
        ],
      }),
    ];
    const benchmark = [
      parseEvaluationCase({
        id: "physics-mark-001",
        mode: "mark",
        prompt: [
          {
            role: "user",
            content:
              "Mark a different thermal answer.",
          },
        ],
        rubric: {
          forbiddenPhrases: [],
          requiredConceptGroups: [["energy"]],
          shouldAskLearnerQuestion: false,
        },
        subject: "physics",
        topicIds: [
          "physics.b.thermal-energy-transfers",
        ],
      }),
    ];

    const plan = buildDataCollectionPlan(
      train,
      benchmark,
    );

    expect(plan.immediateCells).toContain(
      "train:chemistry:learn",
    );
    expect(plan.immediateCells).toContain(
      "benchmark:mathematics:revise",
    );
    expect(plan.blockers).toEqual([]);
    expect(
      plan.topicDiversityCandidates.length,
    ).toBeGreaterThan(0);
    expect(plan.guidance.join(" ")).toContain(
      "not as a requirement",
    );
  });

  it("blocks on train-benchmark leakage", () => {
    const user =
      "Explain the exact same collision theory prompt carefully.";
    const train = [
      parseTrainingExample({
        completion: [
          {
            role: "assistant",
            content: "Synthetic answer.",
          },
        ],
        dataOrigin: "synthetic",
        id: "chemistry-learn-001",
        mode: "learn",
        prompt: [
          { role: "user", content: user },
        ],
        subject: "chemistry",
        tags: [],
      }),
    ];
    const benchmark = [
      parseEvaluationCase({
        id: "chemistry-learn-002",
        mode: "learn",
        prompt: [
          { role: "user", content: user },
        ],
        rubric: {
          forbiddenPhrases: [],
          requiredConceptGroups: [["collision"]],
          shouldAskLearnerQuestion: false,
        },
        subject: "chemistry",
      }),
    ];

    expect(
      buildDataCollectionPlan(
        train,
        benchmark,
      ).blockers,
    ).toContain(
      "fix-train-benchmark-leakage-before-training",
    );
  });
});
