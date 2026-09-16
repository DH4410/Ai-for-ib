import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildProjectReadiness,
} from "@/lib/project-readiness";
import {
  parseEvaluationCase,
} from "@/training/evaluation";
import {
  parseTrainingExample,
} from "@/training/schema";

const source = {
  documentType: "textbook" as const,
  id: "physics-book",
  subject: "physics" as const,
};

const train = parseTrainingExample({
  completion: [
    {
      role: "assistant",
      content: "Synthetic tutor response.",
    },
  ],
  dataOrigin: "synthetic",
  id: "physics-learn-001",
  mode: "learn",
  prompt: [
    {
      role: "user",
      content:
        "Teach me specific latent heat carefully.",
    },
  ],
  subject: "physics",
  tags: [],
  topicIds: [
    "physics.b.particulate-matter.specific-latent-heat",
  ],
});

const benchmark = parseEvaluationCase({
  id: "physics-mark-001",
  mode: "mark",
  prompt: [
    {
      role: "user",
      content:
        "Mark a different thermal physics explanation.",
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
});

describe("project readiness", () => {
  it("summarizes source events and keeps OCR counts metadata-only", () => {
    const report = buildProjectReadiness({
      benchmark: [benchmark],
      manifestEvents: [
        {
          chunkCount: 20,
          eventType: "ingested",
          failedPageCount: 0,
          occurredAt: "2026-09-16T18:00:00Z",
          ocrRequiredPageCount: 2,
          pageCount: 100,
          sourceId: "physics-book",
        },
        {
          checksumSha256: "a".repeat(64),
          chunkCount: 20,
          embeddingCount: 20,
          eventType: "indexed",
          occurredAt: "2026-09-16T18:05:00Z",
          sourceId: "physics-book",
        },
      ],
      sources: [source],
      train: [train],
    });

    expect(report.rag).toMatchObject({
      indexedSourceCount: 1,
      ingestedSourceCount: 1,
      ocrRequiredPageCount: 2,
      sources: [
        {
          id: "physics-book",
          indexed: true,
          ingested: true,
          latestEvent: "indexed",
          ocrRequiredPageCount: 2,
        },
      ],
    });
    expect(report.training.blockers).toEqual([]);
    expect(
      report.training.privateFineTuneInputsReady,
    ).toBe(true);
    expect(report.training.warnings).toContain(
      "sft-validation-jsonl-not-configured",
    );
  });

  it("blocks fine-tuning inputs only for missing files or leakage, not target shortfalls", () => {
    const missing = buildProjectReadiness({
      manifestEvents: [],
      sources: [source],
    });

    expect(missing.training.blockers).toEqual([
      "private-train-jsonl-missing",
      "private-benchmark-jsonl-missing",
    ]);
    expect(
      missing.training.privateFineTuneInputsReady,
    ).toBe(false);

    const smallClean = buildProjectReadiness({
      benchmark: [benchmark],
      manifestEvents: [],
      sources: [source],
      train: [train],
    });

    expect(smallClean.training.blockers).toEqual(
      [],
    );
    expect(smallClean.training.warnings).toContain(
      "training-coverage-below-initial-target",
    );
  });
});
