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

export type TrainingSplitAudit = {
  trainCount: number;
  evalCount: number;
  exactIdOverlaps: string[];
  exactPromptOverlaps: SplitLeakage[];
  nearPromptOverlaps: SplitLeakage[];
  trainCoverageGaps: string[];
  evalCoverageGaps: string[];
  trainCoverageShortfalls: CoverageShortfall[];
  evalCoverageShortfalls: CoverageShortfall[];
};

function normalizedUserPrompt(
  example: PromptCase,
): string {
  return example.prompt
    .filter(({ role }) => role === "user")
    .map(({ content }) => content)
    .join("\n")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
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

export function auditTrainingSplit(
  train: TrainingExample[],
  evaluation: EvaluationCase[],
  nearThreshold = 0.9,
): TrainingSplitAudit {
  const trainIds = new Set(train.map(({ id }) => id));
  const exactIdOverlaps = evaluation
    .map(({ id }) => id)
    .filter((id) => trainIds.has(id));

  const trainPrompts = train.map((example) => ({
    id: example.id,
    normalized: normalizedUserPrompt(example),
  }));
  const evalPrompts = evaluation.map((example) => ({
    id: example.id,
    normalized: normalizedUserPrompt(example),
  }));

  const exactPromptOverlaps: SplitLeakage[] = [];
  const nearPromptOverlaps: SplitLeakage[] = [];

  for (const evalPrompt of evalPrompts) {
    const evalTokens = tokenSet(evalPrompt.normalized);

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

      const trainTokens = tokenSet(
        trainPrompt.normalized,
      );
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
    evalCoverageGaps: coverageGaps(evaluation),
    evalCoverageShortfalls: coverageShortfalls(
      evaluation,
      EVAL_TARGET_PER_CORE_CELL,
    ),
    exactIdOverlaps,
    exactPromptOverlaps,
    nearPromptOverlaps,
    trainCount: train.length,
    trainCoverageGaps: coverageGaps(train),
    trainCoverageShortfalls: coverageShortfalls(
      train,
      TRAIN_TARGET_PER_CORE_CELL,
    ),
  };
}

export function hasTrainingSplitLeakage(
  audit: TrainingSplitAudit,
): boolean {
  return (
    audit.exactIdOverlaps.length > 0 ||
    audit.exactPromptOverlaps.length > 0 ||
    audit.nearPromptOverlaps.length > 0
  );
}
