import { createHash } from "node:crypto";

import type {
  TrainingExample,
  TrainingMode,
  TrainingSubject,
} from "@/training/schema";

export type SftSplit = {
  train: TrainingExample[];
  validation: TrainingExample[];
};

function cellKey(
  example: Pick<TrainingExample, "subject" | "mode">,
): string {
  return `${example.subject}:${example.mode}`;
}

function stableOrder(example: TrainingExample): string {
  return createHash("sha256")
    .update(example.id)
    .digest("hex");
}

export function splitSftExamples(
  examples: TrainingExample[],
  validationRatio = 0.1,
): SftSplit {
  if (
    !Number.isFinite(validationRatio) ||
    validationRatio < 0 ||
    validationRatio >= 0.5
  ) {
    throw new Error(
      "validationRatio must be at least 0 and below 0.5",
    );
  }

  const groups = new Map<
    string,
    TrainingExample[]
  >();

  for (const example of examples) {
    const key = cellKey(example);
    groups.set(key, [
      ...(groups.get(key) ?? []),
      example,
    ]);
  }

  const train: TrainingExample[] = [];
  const validation: TrainingExample[] = [];

  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) =>
      stableOrder(left).localeCompare(
        stableOrder(right),
      ),
    );

    const desired =
      validationRatio === 0 || ordered.length < 2
        ? 0
        : Math.max(
            1,
            Math.round(
              ordered.length * validationRatio,
            ),
          );
    const validationCount = Math.min(
      desired,
      Math.max(0, ordered.length - 1),
    );

    validation.push(
      ...ordered.slice(0, validationCount),
    );
    train.push(
      ...ordered.slice(validationCount),
    );
  }

  const byStableId = (
    left: TrainingExample,
    right: TrainingExample,
  ) => left.id.localeCompare(right.id);

  return {
    train: train.sort(byStableId),
    validation: validation.sort(byStableId),
  };
}

export function summarizeSftSplit(
  split: SftSplit,
): {
  train: number;
  validation: number;
  validationCells: string[];
  trainCells: string[];
} {
  const cells = (items: TrainingExample[]) => [
    ...new Set(items.map(cellKey)),
  ].sort();

  return {
    train: split.train.length,
    trainCells: cells(split.train),
    validation: split.validation.length,
    validationCells: cells(split.validation),
  };
}
