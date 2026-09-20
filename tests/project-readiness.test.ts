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
          classifiedChunkCount: 16,
          eventType: "ingested",
          failedPageCount: 0,
          occurredAt: "2026-09-16T18:00:00Z",
          ocrRequiredPageCount: 2,
          pageCount: 100,
          sourceId: "physics-book",
          unclassifiedChunkCount: 4,
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
      classificationCoverage: 0.8,
      classifiedChunkCount: 16,
      indexedSourceCount: 1,
      ingestedNotIndexedSourceIds: [],
      ingestedSourceCount: 1,
      notStartedSourceIds: [],
      ocrRequiredPageCount: 2,
      ocrRequiredSourceIds: [
        "physics-book",
      ],
      sources: [
        {
          id: "physics-book",
          classificationCoverage: 0.8,
          classifiedChunkCount: 16,
          indexed: true,
          indexStatus: "fresh",
          ingested: true,
          latestEvent: "indexed",
          ocrRequiredPageCount: 2,
          unclassifiedChunkCount: 4,
        },
      ],
      unclassifiedChunkCount: 4,
      staleIndexSourceIds: [],
      unclassifiedSourceIds: [
        "physics-book",
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

  it("marks an old database index stale after a newer ingestion or OCR pass", () => {
    const report = buildProjectReadiness({
      manifestEvents: [
        {
          chunkCount: 10,
          classifiedChunkCount: 8,
          eventType: "ingested",
          failedPageCount: 0,
          occurredAt:
            "2026-09-16T18:00:00Z",
          ocrRequiredPageCount: 2,
          pageCount: 50,
          sourceId: "physics-book",
          unclassifiedChunkCount: 2,
        },
        {
          checksumSha256: "a".repeat(64),
          chunkCount: 10,
          embeddingCount: 10,
          eventType: "indexed",
          occurredAt:
            "2026-09-16T18:05:00Z",
          sourceId: "physics-book",
        },
        {
          chunkCount: 12,
          classifiedChunkCount: 11,
          eventType: "ingested",
          failedPageCount: 0,
          occurredAt:
            "2026-09-16T18:10:00Z",
          ocrRequiredPageCount: 0,
          pageCount: 50,
          sourceId: "physics-book",
          unclassifiedChunkCount: 1,
        },
      ],
      sources: [source],
    });

    expect(report.rag.sources[0]).toMatchObject({
      indexed: false,
      indexStatus: "stale",
      ingested: true,
      ocrRequiredPageCount: 0,
    });
    expect(
      report.rag.staleIndexSourceIds,
    ).toEqual(["physics-book"]);
    expect(
      report.rag.ingestedNotIndexedSourceIds,
    ).toEqual(["physics-book"]);
  });

  it("treats a new materialized version as not yet ingested even when an older version was indexed", () => {
    const report = buildProjectReadiness({
      manifestEvents: [
        {
          byteCount: 100,
          checksumSha256: "a".repeat(64),
          eventType: "materialized",
          localRelativePath:
            "physics/old.pdf",
          mimeType: "application/pdf",
          occurredAt:
            "2026-09-16T18:00:00Z",
          sourceId: "physics-book",
        },
        {
          chunkCount: 10,
          eventType: "ingested",
          failedPageCount: 0,
          occurredAt:
            "2026-09-16T18:01:00Z",
          ocrRequiredPageCount: 0,
          pageCount: 50,
          sourceId: "physics-book",
        },
        {
          checksumSha256: "a".repeat(64),
          chunkCount: 10,
          embeddingCount: 10,
          eventType: "indexed",
          occurredAt:
            "2026-09-16T18:02:00Z",
          sourceId: "physics-book",
        },
        {
          byteCount: 120,
          checksumSha256: "b".repeat(64),
          eventType: "materialized",
          localRelativePath:
            "physics/new.pdf",
          mimeType: "application/pdf",
          occurredAt:
            "2026-09-16T18:20:00Z",
          sourceId: "physics-book",
        },
      ],
      sources: [source],
    });

    expect(report.rag.sources[0]).toMatchObject({
      indexed: false,
      indexStatus: "stale",
      ingested: false,
      latestEvent: "materialized",
    });
    expect(
      report.rag.staleIndexSourceIds,
    ).toEqual(["physics-book"]);
  });

  it("blocks contradictory duplicate training prompts and surfaces repetition warnings", () => {
    const conflicting = parseTrainingExample({
      completion: [
        {
          role: "assistant",
          content:
            "A contradictory synthetic response.",
        },
      ],
      dataOrigin: "synthetic",
      id: "physics-learn-002",
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

    const report = buildProjectReadiness({
      benchmark: [benchmark],
      manifestEvents: [],
      sources: [source],
      train: [train, conflicting],
    });

    expect(report.training.blockers).toContain(
      "conflicting-training-prompts",
    );
    expect(
      report.training.privateFineTuneInputsReady,
    ).toBe(false);
    expect(
      report.training.dataQualityAudit
        ?.conflictingPromptPairs,
    ).toHaveLength(1);
  });

  it("blocks fine-tuning inputs only for missing files or leakage, not target shortfalls", () => {
    const missing = buildProjectReadiness({
      manifestEvents: [],
      sources: [source],
    });

    expect(
      missing.rag.notStartedSourceIds,
    ).toEqual(["physics-book"]);
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
