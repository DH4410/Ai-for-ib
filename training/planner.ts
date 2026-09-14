import type {
  TrainingDatasetSummary,
  TrainingExample,
} from "@/training/schema";
import {
  summarizeTrainingExamples,
} from "@/training/schema";

export type TrainingPlanOptions = {
  batchSize: number;
  epochs: number;
  gradientAccumulation: number;
  maxLength: number;
};

export type TrainingPlan = {
  examples: number;
  approximateTokens: number;
  approximateTokensAfterTruncation: number;
  averageApproximateTokensPerExample: number;
  examplesLikelyOverMaxLength: number;
  maximumApproximateExampleTokens: number;
  microBatchesPerEpoch: number;
  optimizerStepsPerEpoch: number;
  estimatedOptimizerSteps: number;
  effectiveBatchSize: number;
  coverage: TrainingDatasetSummary;
  warning: string;
};

function assertPositiveInteger(
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

export function approximateTokens(
  example: TrainingExample,
): number {
  const text = [
    ...example.prompt.map(
      ({ role, content }) => `${role}: ${content}`,
    ),
    ...example.completion.map(
      ({ role, content }) => `${role}: ${content}`,
    ),
  ].join("\n");

  // This deliberately stays tokenizer-free so the private planning command
  // works before a base model is selected/downloaded. English chat text
  // commonly lands near a few characters per token; this is an estimate only.
  return Math.max(
    1,
    Math.ceil(Array.from(text).length / 4),
  );
}

export function buildTrainingPlan(
  examples: TrainingExample[],
  options: TrainingPlanOptions,
): TrainingPlan {
  if (examples.length === 0) {
    throw new Error(
      "training plan requires at least one example",
    );
  }
  assertPositiveInteger(
    options.batchSize,
    "batchSize",
  );
  assertPositiveInteger(
    options.gradientAccumulation,
    "gradientAccumulation",
  );
  assertPositiveInteger(
    options.maxLength,
    "maxLength",
  );
  if (
    !Number.isFinite(options.epochs) ||
    options.epochs <= 0
  ) {
    throw new Error("epochs must be greater than zero");
  }

  const tokenCounts = examples.map(approximateTokens);
  const approximateTokenTotal = tokenCounts.reduce(
    (total, value) => total + value,
    0,
  );
  const clippedTokenTotal = tokenCounts.reduce(
    (total, value) =>
      total + Math.min(value, options.maxLength),
    0,
  );
  const microBatchesPerEpoch = Math.ceil(
    examples.length / options.batchSize,
  );
  const optimizerStepsPerEpoch = Math.ceil(
    microBatchesPerEpoch /
      options.gradientAccumulation,
  );

  return {
    approximateTokens: approximateTokenTotal,
    approximateTokensAfterTruncation:
      clippedTokenTotal,
    averageApproximateTokensPerExample:
      Math.round(
        approximateTokenTotal / examples.length,
      ),
    coverage: summarizeTrainingExamples(examples),
    effectiveBatchSize:
      options.batchSize *
      options.gradientAccumulation,
    estimatedOptimizerSteps: Math.ceil(
      optimizerStepsPerEpoch * options.epochs,
    ),
    examples: examples.length,
    examplesLikelyOverMaxLength:
      tokenCounts.filter(
        (value) => value > options.maxLength,
      ).length,
    maximumApproximateExampleTokens: Math.max(
      ...tokenCounts,
    ),
    microBatchesPerEpoch,
    optimizerStepsPerEpoch,
    warning:
      "Token counts are tokenizer-free estimates. Re-check exact sequence lengths after the base model is selected.",
  };
}
