import { createHash } from "node:crypto";

import { learnerTaskKey } from "@/training/split-audit";

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

  // Group exact learner tasks across cells: an ID or system-message change
  // must not put the same task on both sides of the split.
  const groups = new Map<string, TrainingExample[]>();
  const remaining = new Map<string, number>();
  for (const example of examples) {
    const key = learnerTaskKey(example);
    const group = groups.get(key) ?? [];
    group.push(example);
    groups.set(key, group);
    const cell = cellKey(example);
    remaining.set(cell, (remaining.get(cell) ?? 0) + 1);
  }

  const targets = new Map<string, number>();
  for (const [cell, count] of remaining) {
    targets.set(cell, validationRatio === 0 || count < 2
      ? 0
      : Math.min(count - 1, Math.max(1, Math.round(count * validationRatio))));
  }
  const heldOut = new Map<string, number>();
  const train: TrainingExample[] = [];
  const validation: TrainingExample[] = [];
  const ordered = [...groups.values()]
    .map((group) => {
      const rows = [...group].sort((a, b) => stableOrder(a).localeCompare(stableOrder(b)));
      return { rows, key: stableOrder(rows[0]) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  for (const { rows } of ordered) {
    const counts = new Map<string, number>();
    for (const example of rows) {
      const cell = cellKey(example);
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
    // Prefer avoiding leakage and retaining a training example in every cell
    // over forcing a validation quota when groups cannot be split safely.
    const fits = [...counts].every(([cell, count]) =>
      (heldOut.get(cell) ?? 0) + count <= (targets.get(cell) ?? 0) &&
      (remaining.get(cell) ?? 0) > count,
    );
    if (fits) {
      validation.push(...rows);
      for (const [cell, count] of counts) {
        heldOut.set(cell, (heldOut.get(cell) ?? 0) + count);
        remaining.set(cell, (remaining.get(cell) ?? 0) - count);
      }
    } else {
      train.push(...rows);
    }
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
