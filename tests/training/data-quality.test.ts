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
            "Explain why temperature stays constant when ice melts, then ask me one check question.",
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
});
