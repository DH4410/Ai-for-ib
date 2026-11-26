import type {
  EvaluationCase,
} from "@/training/evaluation";
import {
  TRAINING_MODES,
  type TrainingExample,
  type TrainingMode,
  type TrainingSubject,
} from "@/training/schema";

const CORE_SUBJECTS = [
  "physics",
  "chemistry",
  "mathematics",
] as const satisfies readonly TrainingSubject[];

export const TRAIN_TARGET_PER_CORE_CELL = 100;
export const EVAL_TARGET_PER_CORE_CELL = 10;

type PromptCase = {
  id: string;
  subject: TrainingSubject;
  mode: TrainingMode;
  prompt: Array<{
    role: string;
    content: string;
  }>;
};

export type SplitLeakage = {
  evalId: string;
  trainId: string;
  similarity: number;
};

export type CoverageShortfall = {
  cell: string;
  count: number;
  target: number;
  missing: number;
};

export type PromptOverlapAudit = {
  trainCount: number;
  evalCount: number;
  exactIdOverlaps: string[];
  exactPromptOverlaps: SplitLeakage[];
  nearPromptOverlaps: SplitLeakage[];
};

export type TrainingSplitAudit = PromptOverlapAudit & {
  trainCoverageGaps: string[];
  evalCoverageGaps: string[];
  trainCoverageShortfalls: CoverageShortfall[];
  evalCoverageShortfalls: CoverageShortfall[];
};

// Ignore system instructions so changing teaching style cannot hide a reused
// learner task. Keep ordered user/assistant turns and scientific notation.
function taskMessages(example: Pick<PromptCase, "prompt">) {
  return example.prompt
    .filter(({ role }) => role !== "system")
    .map(({ role, content }) => [
      role,
      content.normalize("NFC").replace(/\r\n?/g, "\n").trim(),
    ]);
}

export function learnerTaskKey(example: Pick<PromptCase, "prompt">): string {
  return JSON.stringify(taskMessages(example));
}

function tokenSet(example: Pick<PromptCase, "prompt">): Set<string> {
  // Include variables, signs, numbers, and operators in the advisory score.
  const value = taskMessages(example).map(([, text]) => text).join("\n");
  return new Set(
    value.match(/[\p{L}\p{M}\p{N}]+|[+\-−×÷=<>^*/±≤≥]/gu) ?? [],
  );
}

function jaccard(
  left: Set<string>,
  right: Set<string>,
): number {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function cellCounts(
  examples: Array<{
    subject: TrainingSubject;
    mode: TrainingMode;
  }>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const { subject, mode } of examples) {
    const key = `${subject}:${mode}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function coverageGaps(
  examples: Array<{
    subject: TrainingSubject;
    mode: TrainingMode;
  }>,
): string[] {
  const counts = cellCounts(examples);

  return CORE_SUBJECTS.flatMap((subject) =>
    TRAINING_MODES.flatMap((mode) => {
      const key = `${subject}:${mode}`;
      return (counts.get(key) ?? 0) > 0
        ? []
        : [key];
    }),
  );
}

function coverageShortfalls(
  examples: Array<{
    subject: TrainingSubject;
    mode: TrainingMode;
  }>,
  target: number,
): CoverageShortfall[] {
  const counts = cellCounts(examples);

  return CORE_SUBJECTS.flatMap((subject) =>
    TRAINING_MODES.flatMap((mode) => {
      const cell = `${subject}:${mode}`;
      const count = counts.get(cell) ?? 0;
      if (count >= target) {
        return [];
      }

      return [
        {
          cell,
          count,
          missing: target - count,
          target,
        },
      ];
    }),
  );
}

export function auditPromptOverlap(
  train: PromptCase[],
  evaluation: PromptCase[],
  nearThreshold = 0.9,
): PromptOverlapAudit {
  if (!Number.isFinite(nearThreshold) || nearThreshold <= 0 || nearThreshold > 1) {
    throw new Error("near prompt threshold must be in (0, 1]");
  }
  const trainIds = new Set(train.map(({ id }) => id));
  const exactIdOverlaps = evaluation
    .map(({ id }) => id)
    .filter((id) => trainIds.has(id));

  const trainPrompts = train.map((example) => ({
    id: example.id,
    normalized: learnerTaskKey(example),
    tokens: tokenSet(example),
  }));
  const evalPrompts = evaluation.map((example) => ({
    id: example.id,
    normalized: learnerTaskKey(example),
    tokens: tokenSet(example),
  }));

  const exactPromptOverlaps: SplitLeakage[] = [];
  const nearPromptOverlaps: SplitLeakage[] = [];

  for (const evalPrompt of evalPrompts) {
    const evalTokens = evalPrompt.tokens;

    for (const trainPrompt of trainPrompts) {
      if (
        evalPrompt.normalized ===
        trainPrompt.normalized
      ) {
        exactPromptOverlaps.push({
          evalId: evalPrompt.id,
          similarity: 1,
          trainId: trainPrompt.id,
        });
        continue;
      }

      const trainTokens = trainPrompt.tokens;
      if (
        evalTokens.size < 5 ||
        trainTokens.size < 5
      ) {
        continue;
      }

      const similarity = jaccard(
        evalTokens,
        trainTokens,
      );
      if (similarity >= nearThreshold) {
        nearPromptOverlaps.push({
          evalId: evalPrompt.id,
          similarity: Number(
            similarity.toFixed(3),
          ),
          trainId: trainPrompt.id,
        });
      }
    }
  }

  return {
    evalCount: evaluation.length,
    exactIdOverlaps,
    exactPromptOverlaps,
    nearPromptOverlaps,
    trainCount: train.length,
  };
}

export function auditTrainingSplit(
  train: TrainingExample[],
  evaluation: EvaluationCase[],
  nearThreshold = 0.9,
): TrainingSplitAudit {
  return {
    ...auditPromptOverlap(train, evaluation, nearThreshold),
    evalCoverageGaps: coverageGaps(evaluation),
    evalCoverageShortfalls: coverageShortfalls(evaluation, EVAL_TARGET_PER_CORE_CELL),
    trainCoverageGaps: coverageGaps(train),
    trainCoverageShortfalls: coverageShortfalls(train, TRAIN_TARGET_PER_CORE_CELL),
  };
}

export function hasTrainingSplitLeakage(audit: PromptOverlapAudit): boolean {
  return (
    audit.exactIdOverlaps.length > 0 ||
    audit.exactPromptOverlaps.length > 0 ||
    audit.nearPromptOverlaps.length > 0
  );
}

export type ValidationSplitAudit = {
  trainValidation: PromptOverlapAudit;
  validationBenchmark?: PromptOverlapAudit;
};

export function auditValidationSplit(
  train: TrainingExample[],
  validation: TrainingExample[],
  benchmark?: EvaluationCase[],
): ValidationSplitAudit {
  return {
    trainValidation: auditPromptOverlap(train, validation),
    validationBenchmark: benchmark ? auditPromptOverlap(validation, benchmark) : undefined,
  };
}
