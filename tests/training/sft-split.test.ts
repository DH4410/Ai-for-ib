import {
  describe,
  expect,
  it,
} from "vitest";

import {
  splitSftExamples,
} from "@/training/sft-split";
import {
  parseTrainingExample,
  type TrainingExample,
} from "@/training/schema";

function fixture(
  id: string,
  subject: "physics" | "chemistry",
  mode: "learn" | "mark",
): TrainingExample {
  return parseTrainingExample({
    completion: [
      {
        role: "assistant",
        content: "Synthetic tutor response.",
      },
    ],
    dataOrigin: "synthetic",
    id,
    mode,
    prompt: [
      {
        role: "user",
        content: `Synthetic learner prompt ${id}`,
      },
    ],
    subject,
    tags: [],
  });
}

describe("SFT train/validation split", () => {
  it("is deterministic and keeps every multi-example cell represented in train and validation", () => {
    const examples = [
      ...Array.from(
        { length: 10 },
        (_, index) =>
          fixture(
            `physics-learn-${String(index).padStart(3, "0")}`,
            "physics",
            "learn",
          ),
      ),
      ...Array.from(
        { length: 10 },
        (_, index) =>
          fixture(
            `chemistry-mark-${String(index).padStart(3, "0")}`,
            "chemistry",
            "mark",
          ),
      ),
    ];

    const first = splitSftExamples(
      examples,
      0.2,
    );
    const second = splitSftExamples(
      [...examples].reverse(),
      0.2,
    );

    expect(first).toEqual(second);
    expect(first.validation).toHaveLength(4);
    expect(first.train).toHaveLength(16);
    expect(
      new Set(
        first.validation.map(
          ({ subject, mode }) =>
            `${subject}:${mode}`,
        ),
      ),
    ).toEqual(
      new Set([
        "physics:learn",
        "chemistry:mark",
      ]),
    );
  });

  it("never removes the only example from a cell", () => {
    const only = fixture(
      "physics-learn-only",
      "physics",
      "learn",
    );

    const split = splitSftExamples(
      [only],
      0.2,
    );

    expect(split.train).toEqual([only]);
    expect(split.validation).toEqual([]);
  });

  it("rejects unsafe validation ratios", () => {
    expect(() =>
      splitSftExamples(
        [
          fixture(
            "physics-learn-001",
            "physics",
            "learn",
          ),
        ],
        0.5,
      ),
    ).toThrow(
      "validationRatio must be at least 0 and below 0.5",
    );
  });
});
