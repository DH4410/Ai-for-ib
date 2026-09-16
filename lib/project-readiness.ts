import type { ManifestEvent } from "@/lib/study-source/types";
import type { EvaluationCase } from "@/training/evaluation";
import {
  auditTrainingSplit,
  hasTrainingSplitLeakage,
  type TrainingSplitAudit,
} from "@/training/split-audit";
import {
  summarizeTrainingExamples,
  type TrainingDatasetSummary,
  type TrainingExample,
} from "@/training/schema";
import {
  summarizeTopicCoverage,
  type SubjectTopicCoverage,
} from "@/training/topic-coverage";
import type {
  StudyDocumentType,
  StudySourceSubject,
} from "@/lib/study-source/types";

export type ReadinessSourceRecord = {
  id: string;
  subject: StudySourceSubject;
  documentType: StudyDocumentType;
};

export type SourceReadiness = ReadinessSourceRecord & {
  latestEvent: ManifestEvent["eventType"] | "not_started";
  indexed: boolean;
  ingested: boolean;
  indexStatus:
    | "fresh"
    | "stale"
    | "not_indexed";
  ocrRequiredPageCount: number;
  classifiedChunkCount: number | null;
  unclassifiedChunkCount: number | null;
  classificationCoverage: number | null;
  failed: boolean;
};

export type TrainingInputReadiness = {
  trainPresent: boolean;
  validationPresent: boolean;
  benchmarkPresent: boolean;
  trainSummary?: TrainingDatasetSummary;
  benchmarkCount?: number;
  splitAudit?: TrainingSplitAudit;
  trainTopicCoverage?: SubjectTopicCoverage[];
  benchmarkTopicCoverage?: SubjectTopicCoverage[];
};

export type ProjectReadiness = {
  rag: {
    sources: SourceReadiness[];
    indexedSourceCount: number;
    ingestedSourceCount: number;
    failedSourceIds: string[];
    staleIndexSourceIds: string[];
    notStartedSourceIds: string[];
    ingestedNotIndexedSourceIds: string[];
    ocrRequiredSourceIds: string[];
    unclassifiedSourceIds: string[];
    ocrRequiredPageCount: number;
    classifiedChunkCount: number;
    unclassifiedChunkCount: number;
    classificationCoverage: number | null;
  };
  training: TrainingInputReadiness & {
    privateFineTuneInputsReady: boolean;
    blockers: string[];
    warnings: string[];
  };
};

function latestSourceEvent(
  events: ManifestEvent[],
  sourceId: string,
): ManifestEvent | undefined {
  return [...events]
    .reverse()
    .find((event) => event.sourceId === sourceId);
}

export function summarizeSourceReadiness(
  sources: ReadinessSourceRecord[],
  events: ManifestEvent[],
): ProjectReadiness["rag"] {
  const rows: SourceReadiness[] = sources.map((source) => {
    const sourceEvents = events.filter(
      (event) => event.sourceId === source.id,
    );
    const latest = latestSourceEvent(
      sourceEvents,
      source.id,
    );
    const latestMaterializationIndex =
      sourceEvents.findLastIndex(
        ({ eventType }) =>
          eventType === "materialized" ||
          eventType === "duplicate",
      );
    const latestIngestedIndex =
      sourceEvents.findLastIndex(
        ({ eventType }) =>
          eventType === "ingested",
      );
    const latestIndexedIndex =
      sourceEvents.findLastIndex(
        ({ eventType }) =>
          eventType === "indexed",
      );
    const ingestionIsCurrent =
      latestIngestedIndex >= 0 &&
      (latestMaterializationIndex < 0 ||
        latestIngestedIndex >
          latestMaterializationIndex);
    const indexIsFresh =
      ingestionIsCurrent &&
      latestIndexedIndex >
        latestIngestedIndex;
    const latestIngested =
      latestIngestedIndex >= 0
        ? (sourceEvents[
            latestIngestedIndex
          ] as Extract<
            ManifestEvent,
            { eventType: "ingested" }
          >)
        : undefined;

    const classifiedChunkCount =
      latestIngested?.classifiedChunkCount ??
      null;
    const unclassifiedChunkCount =
      latestIngested?.unclassifiedChunkCount ??
      null;
    const knownChunkCount =
      classifiedChunkCount !== null &&
      unclassifiedChunkCount !== null
        ? classifiedChunkCount +
          unclassifiedChunkCount
        : null;

    return {
      ...source,
      classificationCoverage:
        knownChunkCount && knownChunkCount > 0
          ? classifiedChunkCount! /
            knownChunkCount
          : knownChunkCount === 0
            ? 0
            : null,
      classifiedChunkCount,
      failed: latest?.eventType === "failed",
      indexed: indexIsFresh,
      indexStatus: indexIsFresh
        ? "fresh"
        : latestIndexedIndex >= 0
          ? "stale"
          : "not_indexed",
      ingested: ingestionIsCurrent,
      latestEvent:
        latest?.eventType ?? "not_started",
      ocrRequiredPageCount:
        latestIngested?.ocrRequiredPageCount ?? 0,
      unclassifiedChunkCount,
    };
  });

  const classifiedChunkCount = rows.reduce(
    (total, source) =>
      total +
      (source.classifiedChunkCount ?? 0),
    0,
  );
  const unclassifiedChunkCount = rows.reduce(
    (total, source) =>
      total +
      (source.unclassifiedChunkCount ?? 0),
    0,
  );
  const classifiedTotal =
    classifiedChunkCount +
    unclassifiedChunkCount;

  return {
    classificationCoverage:
      classifiedTotal > 0
        ? classifiedChunkCount /
          classifiedTotal
        : null,
    classifiedChunkCount,
    failedSourceIds: rows
      .filter(({ failed }) => failed)
      .map(({ id }) => id),
    staleIndexSourceIds: rows
      .filter(
        ({ indexStatus }) =>
          indexStatus === "stale",
      )
      .map(({ id }) => id),
    ingestedNotIndexedSourceIds: rows
      .filter(
        ({ ingested, indexed }) =>
          ingested && !indexed,
      )
      .map(({ id }) => id),
    notStartedSourceIds: rows
      .filter(
        ({ latestEvent }) =>
          latestEvent === "not_started",
      )
      .map(({ id }) => id),
    ocrRequiredSourceIds: rows
      .filter(
        ({ ocrRequiredPageCount }) =>
          ocrRequiredPageCount > 0,
      )
      .map(({ id }) => id),
    unclassifiedSourceIds: rows
      .filter(
        ({ unclassifiedChunkCount }) =>
          (unclassifiedChunkCount ?? 0) > 0,
      )
      .map(({ id }) => id),
    indexedSourceCount: rows.filter(
      ({ indexed }) => indexed,
    ).length,
    ingestedSourceCount: rows.filter(
      ({ ingested }) => ingested,
    ).length,
    ocrRequiredPageCount: rows.reduce(
      (total, source) =>
        total + source.ocrRequiredPageCount,
      0,
    ),
    sources: rows,
    unclassifiedChunkCount,
  };
}

export function summarizeTrainingReadiness(args: {
  train?: TrainingExample[];
  validation?: TrainingExample[];
  benchmark?: EvaluationCase[];
}): ProjectReadiness["training"] {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const trainPresent = Boolean(args.train);
  const validationPresent = Boolean(args.validation);
  const benchmarkPresent = Boolean(args.benchmark);

  if (!trainPresent) {
    blockers.push("private-train-jsonl-missing");
  }
  if (!benchmarkPresent) {
    blockers.push("private-benchmark-jsonl-missing");
  }

  const splitAudit =
    args.train && args.benchmark
      ? auditTrainingSplit(
          args.train,
          args.benchmark,
        )
      : undefined;

  if (
    splitAudit &&
    hasTrainingSplitLeakage(splitAudit)
  ) {
    blockers.push(
      "train-benchmark-leakage-detected",
    );
  }

  if (!validationPresent) {
    warnings.push(
      "sft-validation-jsonl-not-configured",
    );
  }
  if (
    splitAudit?.trainCoverageShortfalls.length
  ) {
    warnings.push(
      "training-coverage-below-initial-target",
    );
  }
  if (
    splitAudit?.evalCoverageShortfalls.length
  ) {
    warnings.push(
      "benchmark-coverage-below-initial-target",
    );
  }

  return {
    benchmarkCount: args.benchmark?.length,
    benchmarkPresent,
    benchmarkTopicCoverage: args.benchmark
      ? summarizeTopicCoverage(args.benchmark)
      : undefined,
    blockers,
    privateFineTuneInputsReady:
      blockers.length === 0,
    splitAudit,
    trainPresent,
    trainSummary: args.train
      ? summarizeTrainingExamples(args.train)
      : undefined,
    trainTopicCoverage: args.train
      ? summarizeTopicCoverage(args.train)
      : undefined,
    validationPresent,
    warnings,
  };
}

export function buildProjectReadiness(args: {
  sources: ReadinessSourceRecord[];
  manifestEvents: ManifestEvent[];
  train?: TrainingExample[];
  validation?: TrainingExample[];
  benchmark?: EvaluationCase[];
}): ProjectReadiness {
  return {
    rag: summarizeSourceReadiness(
      args.sources,
      args.manifestEvents,
    ),
    training: summarizeTrainingReadiness({
      benchmark: args.benchmark,
      train: args.train,
      validation: args.validation,
    }),
  };
}
