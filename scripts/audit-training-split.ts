import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  auditTrainingSplit,
  hasTrainingSplitLeakage,
} from "../training/split-audit";
import {
  parseTrainingJsonl,
} from "../training/schema";

function usage(): string {
  return [
    "Usage:",
    "  npm run training:audit-split -- <train.jsonl> <eval.jsonl>",
    "",
    "Both files are read locally. The script prints counts/IDs only and never uploads prompt contents.",
  ].join("\n");
}

async function main(): Promise<void> {
  const trainPath = process.argv[2];
  const evalPath = process.argv[3];

  if (
    !trainPath ||
    !evalPath ||
    trainPath === "--help"
  ) {
    console.log(usage());
    if (!trainPath || !evalPath) {
      process.exitCode = 1;
    }
    return;
  }

  const [trainContents, evalContents] =
    await Promise.all([
      readFile(
        resolve(process.cwd(), trainPath),
        "utf8",
      ),
      readFile(
        resolve(process.cwd(), evalPath),
        "utf8",
      ),
    ]);

  const audit = auditTrainingSplit(
    parseTrainingJsonl(trainContents),
    parseTrainingJsonl(evalContents),
  );
  console.log(JSON.stringify(audit, null, 2));

  if (hasTrainingSplitLeakage(audit)) {
    console.error(
      "Training/evaluation leakage detected. Fix the overlaps before benchmarking or fine-tuning.",
    );
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "training split audit failed",
  );
  process.exitCode = 1;
});
