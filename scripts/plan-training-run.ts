import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildTrainingPlan,
} from "../training/planner";
import {
  parseTrainingJsonl,
} from "../training/schema";

function numberArg(
  name: string,
  fallback: number,
): number {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }

  const raw = process.argv[index + 1];
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) {
    throw new Error(`${name} requires a number`);
  }

  return value;
}

async function main(): Promise<void> {
  const datasetPath = process.argv[2];

  if (!datasetPath || datasetPath === "--help") {
    console.log(
      [
        "Usage:",
        "  npm run training:plan -- <train.jsonl> [--epochs 2] [--batch-size 1] [--gradient-accumulation 16] [--max-length 2048]",
        "",
        "Reads the private dataset locally and prints aggregate estimates only.",
      ].join("\n"),
    );
    if (!datasetPath) {
      process.exitCode = 1;
    }
    return;
  }

  const contents = await readFile(
    resolve(process.cwd(), datasetPath),
    "utf8",
  );
  const examples = parseTrainingJsonl(contents);

  const plan = buildTrainingPlan(examples, {
    batchSize: numberArg("--batch-size", 1),
    epochs: numberArg("--epochs", 2),
    gradientAccumulation: numberArg(
      "--gradient-accumulation",
      16,
    ),
    maxLength: numberArg(
      "--max-length",
      2048,
    ),
  });

  console.log(JSON.stringify(plan, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "training plan failed",
  );
  process.exitCode = 1;
});
