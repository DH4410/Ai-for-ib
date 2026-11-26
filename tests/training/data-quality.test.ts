import {
  describe,
  expect,
  it,
} from "vitest";

import {
  auditTrainingDataQuality,
  trainingDataQualityBlockers,
  trainingDataQualityWarnings,
} from "@/training/data-quality";
import {
  parseTrainingExample,
} from "@/training/schema";

function example(
  id: string,
  user: string,
  assistant: string,
) {
  return parseTrainingExample({
    completion: [
      {
        role: "assistant",
        content: assistant,
      },
    ],
    dataOrigin: "synthetic",
    id,
    mode: "learn",
    prompt: [
      {
        role: "user",
        content: user,
      },
    ],
    subject: "physics",
    tags: [],
  });
}

describe("training data quality audit", () => {
  it("distinguishes duplicate examples from conflicting answers to the same prompt", () => {
    const audit =
      auditTrainingDataQuality([
        example(
          "physics-learn-001",
          "Explain specific latent heat in simple words.",
          "Energy is transferred during a change of state.",
        ),
        example(
          "physics-learn-002",
          "Explain specific latent heat in simple words.",
          "Energy is transferred during a change of state.",
        ),
        example(
          "physics-learn-003",
          "Explain specific latent heat in simple words.",
          "Temperature always rises during melting.",
        ),
      ]);

    expect(
      audit.duplicateExamplePairs,
    ).toHaveLength(1);
    expect(
      audit.conflictingPromptPairs,
    ).toHaveLength(2);
    expect(
      trainingDataQualityBlockers(
        audit,
      ),
    ).toEqual([
      "conflicting-training-prompts",
    ]);
  });

  it("flags highly similar prompts and repeated completions without exposing their text", () => {
    const audit =
      auditTrainingDataQuality(
        [
          example(
            "physics-learn-010",
            "Explain why temperature stays constant while ice melts and then ask me one check question.",
            "Use energy and state change ideas.",
          ),
          example(
            "physics-learn-011",
            "Explain why temperature stays constant while ice melts and ask me one check question.",
            "Use energy and state change ideas.",
          ),
        ],
        0.75,
      );

    expect(
      audit.nearPromptPairs,
    ).toEqual([
      expect.objectContaining({
        leftId:
          "physics-learn-010",
        rightId:
          "physics-learn-011",
      }),
    ]);
    expect(
      audit.repeatedCompletionPairs,
    ).toHaveLength(1);
    expect(
      trainingDataQualityWarnings(
        audit,
      ),
    ).toContain(
      "near-duplicate-training-prompts",
    );
    expect(
      trainingDataQualityWarnings(
        audit,
      ),
    ).toContain(
      "repeated-training-completions",
    );
  });

  it("does not collapse different mathematical signs or chemical notation into exact prompts", () => {
    const audit = auditTrainingDataQuality([
      example("math-learn-001", "Evaluate 10^-3.", "0.001"),
      example("math-learn-002", "Evaluate 10^3.", "1000"),
      example("chem-learn-001", "What is Co?", "Cobalt"),
      example("chem-learn-002", "What is CO?", "Carbon monoxide"),
      example("phys-learn-001", "Find acceleration: +2 m/s².", "+2 m/s²"),
      example("phys-learn-002", "Find acceleration: -2 m/s².", "-2 m/s²"),
    ]);

    expect(audit.uniquePromptRatio).toBe(1);
    expect(audit.uniqueCompletionRatio).toBe(1);
    expect(audit.conflictingPromptPairs).toEqual([]);
    expect(audit.duplicateExamplePairs).toEqual([]);
    expect(audit.repeatedCompletionPairs).toEqual([]);
  });

  it("flags opposite answers to the same prompt as conflicts, not duplicates", () => {
    const audit = auditTrainingDataQuality([
      example("math-learn-001", "Solve x + 2 = 0.", "x = -2"),
      example("math-learn-002", "Solve x + 2 = 0.", "x = +2"),
    ]);

    expect(audit.conflictingPromptPairs).toHaveLength(1);
    expect(audit.duplicateExamplePairs).toEqual([]);
    expect(audit.repeatedCompletionPairs).toEqual([]);
    expect(trainingDataQualityBlockers(audit)).toEqual([
      "conflicting-training-prompts",
    ]);
  });

  it("uses ordered system, user and assistant history when distinguishing prompts", () => {
    const a = example("phys-learn-001", "What is the answer?", "2 N");
    const b = example("phys-learn-002", "What is the answer?", "5 N");
    const c = example("phys-learn-003", "What is the answer?", "Use F = ma.");
    const prompt = (
      system: string,
      assistant: string,
    ): typeof a.prompt => [
      { role: "system", content: system },
      { role: "user", content: "Give me a question about force." },
      { role: "assistant", content: assistant },
      ...a.prompt,
    ];
    a.prompt = prompt("Give full answers.", "A 1 kg object accelerates at 2 m/s².");
    b.prompt = prompt("Give full answers.", "A 1 kg object accelerates at 5 m/s².");
    c.prompt = prompt("Give hints only.", "A 1 kg object accelerates at 2 m/s².");

    const audit = auditTrainingDataQuality([a, b, c]);
    expect(audit.uniquePromptRatio).toBe(1);
    expect(audit.conflictingPromptPairs).toEqual([]);
    expect(audit.nearPromptPairs).toEqual([]);
  });

  it("still detects conflicts when only non-model metadata differs", () => {
    const a = example("phys-learn-001", "Explain force.", "One answer.");
    const b = example("phys-practice-002", "Explain force.", "A different answer.");
    b.mode = "practice";
    expect(auditTrainingDataQuality([a, b]).conflictingPromptPairs).toHaveLength(1);
  });

  it("canonicalizes Unicode and line endings without stripping meaningful notation", () => {
    const audit = auditTrainingDataQuality([
      example("phys-learn-001", "Explain café cooling.\r\nUse energy.", "Café cooling."),
      example("phys-learn-002", "Explain cafe\u0301 cooling.\nUse energy.", "Cafe\u0301 cooling."),
    ]);
    expect(audit.duplicateExamplePairs).toHaveLength(1);
    expect(audit.conflictingPromptPairs).toEqual([]);
    expect(audit.uniquePromptRatio).toBe(0.5);
  });

  it("rejects non-finite or out-of-range similarity thresholds", () => {
    for (const threshold of [NaN, Infinity, -Infinity, 0, 1.01]) {
      expect(() => auditTrainingDataQuality([], threshold)).toThrow(
        "near prompt threshold must be in (0, 1]",
      );
    }
    expect(auditTrainingDataQuality([], 1).uniquePromptRatio).toBe(1);
  });

});
