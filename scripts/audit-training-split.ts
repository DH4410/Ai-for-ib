import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  auditTrainingSplit,
  auditValidationSplit,
  hasTrainingSplitLeakage,
} from "../training/split-audit";
import {
  parseEvaluationJsonl,
} from "../training/evaluation";
import {
  parseTrainingJsonl,
} from "../training/schema";

function usage(): string {
  return [
    "Usage:",
    "  npm run training:audit-split -- <train.jsonl> <benchmark.jsonl> [--validation <validation.jsonl>]",
    "",
    "Files are read locally. The benchmark uses rubric-based held-out cases; optional validation uses the SFT schema. All supplied splits are checked pairwise. Output contains counts and IDs, not prompt contents.",
  ].join("\n");
}

async function main(): Promise<void> {
  const trainPath = process.argv[2];
  const benchmarkPath = process.argv[3];
  const extra = process.argv.slice(4);
  if (extra.length !== 0 && (extra.length !== 2 || extra[0] !== "--validation" || !extra[1])) {
    throw new Error("expected optional --validation <validation.jsonl>");
  }

  if (
    !trainPath ||
    !benchmarkPath ||
    trainPath === "--help"
  ) {
    console.log(usage());
    if (!trainPath || !benchmarkPath) {
      process.exitCode = 1;
    }
    return;
  }

  const [trainContents, benchmarkContents] =
    await Promise.all([
      readFile(
        resolve(process.cwd(), trainPath),
        "utf8",
      ),
      readFile(
        resolve(process.cwd(), benchmarkPath),
        "utf8",
      ),
    ]);

  const train = parseTrainingJsonl(trainContents);
  const benchmark = parseEvaluationJsonl(benchmarkContents);
  const audit = auditTrainingSplit(train, benchmark);
  const validationAudit = extra.length
    ? auditValidationSplit(train, parseTrainingJsonl(await readFile(resolve(extra[1]), "utf8")), benchmark)
    : undefined;
  console.log(JSON.stringify({ ...audit, validationAudit }, null, 2));

  if (hasTrainingSplitLeakage(audit) ||
      (validationAudit && hasTrainingSplitLeakage(validationAudit.trainValidation)) ||
      (validationAudit?.validationBenchmark && hasTrainingSplitLeakage(validationAudit.validationBenchmark))) {
    console.error(
      "Dataset split leakage detected. Fix all overlaps before benchmarking or fine-tuning.",
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
