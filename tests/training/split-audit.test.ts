import { describe, expect, it } from "vitest";

import {
  auditTrainingSplit,
  hasTrainingSplitLeakage,
} from "@/training/split-audit";
import {
  parseTrainingExample,
  type TrainingExample,
} from "@/training/schema";

function example(
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

describe("training split audit", () => {
  it("detects exact and near-duplicate learner prompts across train and eval", () => {
    const train = [
      example(
        "physics-learn-001",
        "physics",
        "learn",
        "Explain specific latent heat using an everyday example and then ask me a question.",
      ),
    ];
    const evaluation = [
      example(
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
    expect(hasTrainingSplitLeakage(audit)).toBe(true);
  });

  it("reports missing subject/mode cells without failing a clean split", () => {
    const train = [
      example(
        "physics-learn-001",
        "physics",
        "learn",
        "Teach me specific latent heat from the beginning.",
      ),
    ];
    const evaluation = [
      example(
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

    expect(hasTrainingSplitLeakage(audit)).toBe(false);
    expect(audit.trainCoverageGaps).toContain(
      "chemistry:mark",
    );
    expect(audit.evalCoverageGaps).toContain(
      "physics:learn",
    );
  });
});
