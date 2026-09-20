import {
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  auditTrainingDataQuality,
  trainingDataQualityBlockers,
  trainingDataQualityWarnings,
} from "../training/data-quality";
import {
  parseTrainingJsonl,
} from "../training/schema";

async function main(): Promise<void> {
  const path = process.argv[2];

  if (!path || path === "--help") {
    console.log(
      [
        "Usage:",
        "  npm run training:audit-quality -- <train.jsonl>",
        "",
        "Prints IDs/counts/similarity only; it never prints prompt or completion text.",
      ].join("\n"),
    );
    if (!path) {
      process.exitCode = 1;
    }
    return;
  }

  const examples = parseTrainingJsonl(
    await readFile(
      resolve(process.cwd(), path),
      "utf8",
    ),
  );
  const audit =
    auditTrainingDataQuality(examples);

  console.log(
    JSON.stringify(
      {
        ...audit,
        blockers:
          trainingDataQualityBlockers(
            audit,
          ),
        warnings:
          trainingDataQualityWarnings(
            audit,
          ),
      },
      null,
      2,
    ),
  );

  if (
    trainingDataQualityBlockers(
      audit,
    ).length > 0
  ) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "training data quality audit failed",
  );
  process.exitCode = 1;
});
