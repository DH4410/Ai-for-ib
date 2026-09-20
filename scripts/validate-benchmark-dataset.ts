import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parseEvaluationJsonl,
} from "../training/evaluation";
import {
  TRAINING_MODES,
  TRAINING_SUBJECTS,
} from "../training/schema";

async function main(): Promise<void> {
  const benchmarkPath = process.argv[2];

  if (!benchmarkPath || benchmarkPath === "--help") {
    console.log(
      [
        "Usage:",
        "  npm run training:validate-benchmark -- <benchmark.jsonl>",
        "",
        "The benchmark file is read locally and never uploaded by this script.",
      ].join("\n"),
    );
    if (!benchmarkPath) {
      process.exitCode = 1;
    }
    return;
  }

  const cases = parseEvaluationJsonl(
    await readFile(
      resolve(process.cwd(), benchmarkPath),
      "utf8",
    ),
  );

  const bySubject = Object.fromEntries(
    TRAINING_SUBJECTS.map((subject) => [subject, 0]),
  ) as Record<string, number>;
  const byMode = Object.fromEntries(
    TRAINING_MODES.map((mode) => [mode, 0]),
  ) as Record<string, number>;

  let conceptGroups = 0;
  let numericExpectationCases = 0;
  let numericExpectations = 0;
  let taggedWithTopics = 0;
  const uniqueTopicIds = new Set<string>();
  for (const benchmarkCase of cases) {
    bySubject[benchmarkCase.subject] += 1;
    byMode[benchmarkCase.mode] += 1;
    conceptGroups +=
      benchmarkCase.rubric.requiredConceptGroups.length;
    const caseNumerics =
      benchmarkCase.rubric.numericExpectations?.length ?? 0;
    if (caseNumerics > 0) {
      numericExpectationCases += 1;
      numericExpectations += caseNumerics;
    }
    if ((benchmarkCase.topicIds?.length ?? 0) > 0) {
      taggedWithTopics += 1;
      benchmarkCase.topicIds?.forEach((topicId) =>
        uniqueTopicIds.add(topicId),
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        total: cases.length,
        bySubject,
        byMode,
        numericExpectationCases,
        numericExpectations,
        requiredConceptGroups: conceptGroups,
        taggedWithTopics,
        untaggedCases: cases.length - taggedWithTopics,
        uniqueTopicIds: [...uniqueTopicIds].sort(),
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
      : "benchmark dataset validation failed",
  );
  process.exitCode = 1;
});
