import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildDataCollectionPlan,
} from "../training/data-plan";
import {
  parseEvaluationJsonl,
} from "../training/evaluation";
import {
  parseTrainingJsonl,
} from "../training/schema";

async function main(): Promise<void> {
  const trainPath = process.argv[2];
  const benchmarkPath = process.argv[3];

  if (
    !trainPath ||
    !benchmarkPath ||
    trainPath === "--help"
  ) {
    console.log(
      [
        "Usage:",
        "  npm run training:data-plan -- <train.jsonl> <benchmark.jsonl>",
        "",
        "Prints IDs/counts/coverage metadata only. Private prompt and answer text is never printed.",
      ].join("\n"),
    );
    if (!trainPath || !benchmarkPath) {
      process.exitCode = 1;
    }
    return;
  }

  const [train, benchmark] =
    await Promise.all([
      readFile(
        resolve(process.cwd(), trainPath),
        "utf8",
      ).then(parseTrainingJsonl),
      readFile(
        resolve(
          process.cwd(),
          benchmarkPath,
        ),
        "utf8",
      ).then(parseEvaluationJsonl),
    ]);

  const plan = buildDataCollectionPlan(
    train,
    benchmark,
  );
  console.log(JSON.stringify(plan, null, 2));

  if (plan.blockers.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "training data plan failed",
  );
  process.exitCode = 1;
});
