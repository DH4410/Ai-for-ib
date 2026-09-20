import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseEvaluationJsonl,
} from "@/training/evaluation";
import {
  parseTrainingJsonl,
} from "@/training/schema";

const coreSubjects = [
  "physics",
  "chemistry",
  "mathematics",
] as const;
const modes = [
  "learn",
  "practice",
  "mark",
  "revise",
] as const;

function expectedCells(): string[] {
  return coreSubjects.flatMap((subject) =>
    modes.map((mode) => `${subject}:${mode}`),
  );
}

describe("public synthetic training fixtures", () => {
  it("keeps one valid smoke benchmark case for every core subject and mode", async () => {
    const cases = parseEvaluationJsonl(
      await readFile(
        "training/benchmark.example.jsonl",
        "utf8",
      ),
    );

    expect(cases).toHaveLength(15);
    expect(
      cases.filter(
        ({ rubric }) =>
          (rubric.numericExpectations?.length ?? 0) > 0,
      ),
    ).toHaveLength(3);
    expect(
      [...new Set(
        cases.map(
          ({ subject, mode }) =>
            `${subject}:${mode}`,
        ),
      )].sort(),
    ).toEqual(expectedCells().sort());
  });

  it("keeps one valid behavior example for every core subject and mode", async () => {
    const examples = parseTrainingJsonl(
      await readFile(
        "training/dataset.example.jsonl",
        "utf8",
      ),
    );

    expect(examples).toHaveLength(12);
    expect(
      [...new Set(
        examples.map(
          ({ subject, mode }) =>
            `${subject}:${mode}`,
        ),
      )].sort(),
    ).toEqual(expectedCells().sort());
  });
});
