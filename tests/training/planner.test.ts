import { describe, expect, it } from "vitest";

import {
  approximateTokens,
  buildTrainingPlan,
} from "@/training/planner";
import {
  parseTrainingExample,
  type TrainingExample,
} from "@/training/schema";

function fixture(id: string): TrainingExample {
  return parseTrainingExample({
    completion: [
      {
        role: "assistant",
        content:
          "Use the units as clues, then explain the equation in words.",
      },
    ],
    dataOrigin: "synthetic",
    id,
    mode: "learn",
    prompt: [
      {
        role: "system",
        content: "Teach in small steps.",
      },
      {
        role: "user",
        content:
          "Help me understand q = mc delta T without giving everything away.",
      },
    ],
    subject: "physics",
    tags: [],
  });
}

describe("training planner", () => {
  it("estimates optimizer steps using effective batch size", () => {
    const examples = Array.from(
      { length: 33 },
      (_, index) =>
        fixture(
          `physics-learn-${String(index).padStart(3, "0")}`,
        ),
    );

    const plan = buildTrainingPlan(examples, {
      batchSize: 1,
      epochs: 2,
      gradientAccumulation: 16,
      maxLength: 2048,
    });

    expect(plan.effectiveBatchSize).toBe(16);
    expect(plan.microBatchesPerEpoch).toBe(33);
    expect(plan.optimizerStepsPerEpoch).toBe(3);
    expect(plan.estimatedOptimizerSteps).toBe(6);
    expect(plan.examplesLikelyOverMaxLength).toBe(0);
  });

  it("uses a tokenizer-free estimate and flags likely truncation", () => {
    const example = fixture("physics-learn-999");
    const count = approximateTokens(example);

    const plan = buildTrainingPlan([example], {
      batchSize: 1,
      epochs: 1,
      gradientAccumulation: 1,
      maxLength: Math.max(1, count - 1),
    });

    expect(count).toBeGreaterThan(1);
    expect(plan.examplesLikelyOverMaxLength).toBe(1);
    expect(
      plan.approximateTokensAfterTruncation,
    ).toBe(count - 1);
  });
});
