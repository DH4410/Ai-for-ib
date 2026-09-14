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

export type SplitLeakage = {
  evalId: string;
  trainId: string;
  similarity: number;
};

export type TrainingSplitAudit = {
  trainCount: number;
  evalCount: number;
  exactIdOverlaps: string[];
  exactPromptOverlaps: SplitLeakage[];
  nearPromptOverlaps: SplitLeakage[];
  trainCoverageGaps: string[];
  evalCoverageGaps: string[];
};

function normalizedUserPrompt(
  example: TrainingExample,
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

function coverageGaps(
  examples: TrainingExample[],
): string[] {
  const present = new Set(
    examples.map(
      ({ subject, mode }) => `${subject}:${mode}`,
    ),
  );

  return CORE_SUBJECTS.flatMap((subject) =>
    TRAINING_MODES.flatMap((mode: TrainingMode) => {
      const key = `${subject}:${mode}`;
      return present.has(key) ? [] : [key];
    }),
  );
}

export function auditTrainingSplit(
  train: TrainingExample[],
  evaluation: TrainingExample[],
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
      if (evalPrompt.normalized === trainPrompt.normalized) {
        exactPromptOverlaps.push({
          evalId: evalPrompt.id,
          similarity: 1,
          trainId: trainPrompt.id,
        });
        continue;
      }

      const trainTokens = tokenSet(trainPrompt.normalized);
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
          similarity: Number(similarity.toFixed(3)),
          trainId: trainPrompt.id,
        });
      }
    }
  }

  return {
    evalCount: evaluation.length,
    evalCoverageGaps: coverageGaps(evaluation),
    exactIdOverlaps,
    exactPromptOverlaps,
    nearPromptOverlaps,
    trainCount: train.length,
    trainCoverageGaps: coverageGaps(train),
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
