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
  ocrRequiredPageCount: number;
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
    ocrRequiredPageCount: number;
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
  const rows = sources.map((source) => {
    const sourceEvents = events.filter(
      (event) => event.sourceId === source.id,
    );
    const latest = latestSourceEvent(
      sourceEvents,
      source.id,
    );
    const latestIngested = [...sourceEvents]
      .reverse()
      .find(
        (
          event,
        ): event is Extract<
          ManifestEvent,
          { eventType: "ingested" }
        > => event.eventType === "ingested",
      );

    return {
      ...source,
      failed: latest?.eventType === "failed",
      indexed: sourceEvents.some(
        ({ eventType }) => eventType === "indexed",
      ),
      ingested: sourceEvents.some(
        ({ eventType }) => eventType === "ingested",
      ),
      latestEvent:
        latest?.eventType ?? "not_started",
      ocrRequiredPageCount:
        latestIngested?.ocrRequiredPageCount ?? 0,
    };
  });

  return {
    failedSourceIds: rows
      .filter(({ failed }) => failed)
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
