import {
  describe,
  expect,
  it,
} from "vitest";

import {
  splitSftExamples,
} from "@/training/sft-split";
import { learnerTaskKey } from "@/training/split-audit";
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
  it("keeps identical tasks together even across modes and system instructions", () => {
    const a = fixture("physics-learn-001", "physics", "learn");
    const b = fixture("chemistry-mark-001", "chemistry", "mark");
    b.prompt = [{ role: "system", content: "Use hints." }, ...a.prompt];
    const rows = [a, b, ...Array.from({ length: 8 }, (_, i) =>
      fixture("physics-learn-extra-" + i, "physics", "learn"))];
    const split = splitSftExamples(rows, 0.2);
    const trainTasks = new Set(split.train.map(learnerTaskKey));
    expect(split.validation.some((v) => trainTasks.has(learnerTaskKey(v)))).toBe(false);
    expect(split.train.some((v) => v.id === b.id)).toBe(true);
    expect(split.train.some((v) => v.id === a.id)).toBe(true);
    expect(splitSftExamples([...rows].reverse(), 0.2)).toEqual(split);
  });

  it("does not divide a cell consisting entirely of identical tasks", () => {
    const a = fixture("physics-learn-001", "physics", "learn");
    const b = { ...a, id: "physics-learn-002" };
    const split = splitSftExamples([a, b], 0.2);
    expect(split.train).toHaveLength(2);
    expect(split.validation).toEqual([]);
  });

});
