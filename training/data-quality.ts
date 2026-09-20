import type {
  TrainingExample,
} from "@/training/schema";

export type TrainingSimilarityPair = {
  leftId: string;
  rightId: string;
  similarity: number;
};

export type TrainingDataQualityAudit = {
  exampleCount: number;
  uniquePromptRatio: number;
  uniqueCompletionRatio: number;
  duplicateExamplePairs: TrainingSimilarityPair[];
  conflictingPromptPairs: TrainingSimilarityPair[];
  nearPromptPairs: TrainingSimilarityPair[];
  repeatedCompletionPairs: TrainingSimilarityPair[];
};

function normalize(
  value: string,
): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^p{L}p{N}]+/gu, " ")
    .trim()
    .replace(/s+/g, " ");
}

function promptText(
  example: TrainingExample,
): string {
  return normalize(
    example.prompt
      .filter(({ role }) => role === "user")
      .map(({ content }) => content)
      .join("\n"),
  );
}

function completionText(
  example: TrainingExample,
): string {
  return normalize(
    example.completion[0].content,
  );
}

function tokenSet(
  value: string,
): Set<string> {
  return new Set(
    value
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

function jaccard(
  left: string,
  right: string,
): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (
    leftTokens.size === 0 &&
    rightTokens.size === 0
  ) {
    return 1;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union =
    leftTokens.size +
    rightTokens.size -
    intersection;
  return union === 0
    ? 0
    : intersection / union;
}

function rounded(
  value: number,
): number {
  return Number(value.toFixed(3));
}

function ratio(
  uniqueCount: number,
  total: number,
): number {
  return total === 0
    ? 1
    : Number(
        (uniqueCount / total).toFixed(3),
      );
}

export function auditTrainingDataQuality(
  examples: TrainingExample[],
  nearPromptThreshold = 0.9,
): TrainingDataQualityAudit {
  if (
    nearPromptThreshold <= 0 ||
    nearPromptThreshold > 1
  ) {
    throw new Error(
      "near prompt threshold must be in (0, 1]",
    );
  }

  const normalized = examples.map(
    (example) => ({
      completion:
        completionText(example),
      id: example.id,
      prompt: promptText(example),
    }),
  );
  const duplicateExamplePairs:
    TrainingSimilarityPair[] = [];
  const conflictingPromptPairs:
    TrainingSimilarityPair[] = [];
  const nearPromptPairs:
    TrainingSimilarityPair[] = [];
  const repeatedCompletionPairs:
    TrainingSimilarityPair[] = [];

  for (
    let leftIndex = 0;
    leftIndex < normalized.length;
    leftIndex += 1
  ) {
    const left = normalized[leftIndex];

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalized.length;
      rightIndex += 1
    ) {
      const right =
        normalized[rightIndex];

      if (left.prompt === right.prompt) {
        const pair = {
          leftId: left.id,
          rightId: right.id,
          similarity: 1,
        };

        if (
          left.completion ===
          right.completion
        ) {
          duplicateExamplePairs.push(
            pair,
          );
        } else {
          conflictingPromptPairs.push(
            pair,
          );
        }
      } else {
        const similarity = jaccard(
          left.prompt,
          right.prompt,
        );
        const leftTokenCount =
          tokenSet(left.prompt).size;
        const rightTokenCount =
          tokenSet(right.prompt).size;

        if (
          leftTokenCount >= 5 &&
          rightTokenCount >= 5 &&
          similarity >=
            nearPromptThreshold
        ) {
          nearPromptPairs.push({
            leftId: left.id,
            rightId: right.id,
            similarity:
              rounded(similarity),
          });
        }
      }

      if (
        left.completion &&
        left.completion ===
          right.completion
      ) {
        repeatedCompletionPairs.push({
          leftId: left.id,
          rightId: right.id,
          similarity: 1,
        });
      }
    }
  }

  return {
    conflictingPromptPairs,
    duplicateExamplePairs,
    exampleCount: normalized.length,
    nearPromptPairs,
    repeatedCompletionPairs,
    uniqueCompletionRatio: ratio(
      new Set(
        normalized.map(
          ({ completion }) => completion,
        ),
      ).size,
      normalized.length,
    ),
    uniquePromptRatio: ratio(
      new Set(
        normalized.map(
          ({ prompt }) => prompt,
        ),
      ).size,
      normalized.length,
    ),
  };
}

export function trainingDataQualityWarnings(
  audit: TrainingDataQualityAudit,
): string[] {
  return [
    ...(audit.duplicateExamplePairs.length > 0
      ? ["duplicate-training-examples"]
      : []),
    ...(audit.nearPromptPairs.length > 0
      ? ["near-duplicate-training-prompts"]
      : []),
    ...(audit.repeatedCompletionPairs.length > 0
      ? ["repeated-training-completions"]
      : []),
  ];
}

export function trainingDataQualityBlockers(
  audit: TrainingDataQualityAudit,
): string[] {
  return audit.conflictingPromptPairs.length > 0
    ? ["conflicting-training-prompts"]
    : [];
}
