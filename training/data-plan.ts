import { IBDP_TOPICS } from "@/lib/taxonomy/ibdp";
import type { EvaluationCase } from "@/training/evaluation";
import {
  auditTrainingSplit,
  hasTrainingSplitLeakage,
} from "@/training/split-audit";
import type { TrainingExample } from "@/training/schema";
import { summarizeTopicCoverage } from "@/training/topic-coverage";

export type DataCollectionPlan = {
  blockers: string[];
  immediateCells: string[];
  trainingShortfalls: Array<{
    cell: string;
    count: number;
    target: number;
    missing: number;
  }>;
  benchmarkShortfalls: Array<{
    cell: string;
    count: number;
    target: number;
    missing: number;
  }>;
  topicDiversityCandidates: Array<{
    subject: string;
    topicId: string;
    label: string;
    missingFromTraining: boolean;
    missingFromBenchmark: boolean;
  }>;
  metadataCleanup: {
    untaggedTrainingExamples: number;
    untaggedBenchmarkCases: number;
  };
  guidance: string[];
};

export function buildDataCollectionPlan(
  train: TrainingExample[],
  benchmark: EvaluationCase[],
): DataCollectionPlan {
  const audit = auditTrainingSplit(train, benchmark);
  const trainCoverage = summarizeTopicCoverage(train);
  const benchmarkCoverage = summarizeTopicCoverage(benchmark);

  const blockers: string[] = [];
  if (hasTrainingSplitLeakage(audit)) {
    blockers.push(
      "fix-train-benchmark-leakage-before-training",
    );
  }

  const immediateCells = [
    ...audit.trainCoverageGaps.map(
      (cell) => "train:" + cell,
    ),
    ...audit.evalCoverageGaps.map(
      (cell) => "benchmark:" + cell,
    ),
  ].sort();

  const topicById = new Map(
    IBDP_TOPICS.map((topic) => [
      topic.id,
      topic,
    ]),
  );
  const trainingMissing = new Set(
    trainCoverage.flatMap(
      ({ uncoveredLeafTopicIds }) =>
        uncoveredLeafTopicIds,
    ),
  );
  const benchmarkMissing = new Set(
    benchmarkCoverage.flatMap(
      ({ uncoveredLeafTopicIds }) =>
        uncoveredLeafTopicIds,
    ),
  );

  const topicDiversityCandidates = [
    ...new Set([
      ...trainingMissing,
      ...benchmarkMissing,
    ]),
  ]
    .map((topicId) => {
      const topic = topicById.get(topicId);
      return {
        label: topic?.label ?? topicId,
        missingFromBenchmark:
          benchmarkMissing.has(topicId),
        missingFromTraining:
          trainingMissing.has(topicId),
        subject:
          topic?.subject ?? "unknown",
        topicId,
      };
    })
    .sort((left, right) => {
      const leftPriority =
        Number(left.missingFromBenchmark) * 2 +
        Number(left.missingFromTraining);
      const rightPriority =
        Number(right.missingFromBenchmark) * 2 +
        Number(right.missingFromTraining);
      return (
        rightPriority - leftPriority ||
        left.subject.localeCompare(
          right.subject,
        ) ||
        left.label.localeCompare(right.label)
      );
    });

  const untaggedTrainingExamples =
    trainCoverage.reduce(
      (total, item) =>
        total + item.untaggedCases,
      0,
    );
  const untaggedBenchmarkCases =
    benchmarkCoverage.reduce(
      (total, item) =>
        total + item.untaggedCases,
      0,
    );

  const guidance = [
    ...(immediateCells.length > 0
      ? [
          "Fill zero-coverage subject × mode cells before increasing already-populated cells.",
        ]
      : []),
    ...(blockers.length > 0
      ? [
          "Remove train/benchmark prompt leakage before model selection or fine-tuning.",
        ]
      : []),
    "Use count shortfalls as directional targets, not quotas; do not pad with repetitive low-quality examples.",
    "Use uncovered leaf topics as syllabus-diversity candidates, not as a requirement to fine-tune every topic.",
    "Keep raw textbook and past-paper wording in retrieval unless training rights explicitly permit model training.",
  ];

  return {
    benchmarkShortfalls:
      audit.evalCoverageShortfalls,
    blockers,
    guidance,
    immediateCells,
    metadataCleanup: {
      untaggedBenchmarkCases,
      untaggedTrainingExamples,
    },
    topicDiversityCandidates,
    trainingShortfalls:
      audit.trainCoverageShortfalls,
  };
}
