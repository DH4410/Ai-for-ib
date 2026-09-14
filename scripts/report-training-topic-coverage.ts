import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parseEvaluationJsonl,
} from "../training/evaluation";
import {
  parseTrainingJsonl,
} from "../training/schema";
import {
  summarizeTopicCoverage,
} from "../training/topic-coverage";

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
        "  npm run training:topic-coverage -- <train.jsonl> <benchmark.jsonl>",
        "",
        "Reports aggregate topic IDs only. Private prompt/completion text is never printed.",
        "Uncovered leaf topics are a diversity diagnostic, not a hard fine-tuning requirement.",
      ].join("\n"),
    );
    if (!trainPath || !benchmarkPath) {
      process.exitCode = 1;
    }
    return;
  }

  const [train, benchmark] = await Promise.all([
    readFile(
      resolve(process.cwd(), trainPath),
      "utf8",
    ).then(parseTrainingJsonl),
    readFile(
      resolve(process.cwd(), benchmarkPath),
      "utf8",
    ).then(parseEvaluationJsonl),
  ]);

  console.log(
    JSON.stringify(
      {
        train: summarizeTopicCoverage(train),
        benchmark:
          summarizeTopicCoverage(benchmark),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "topic coverage report failed",
  );
  process.exitCode = 1;
});
