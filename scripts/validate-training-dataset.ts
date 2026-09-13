import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  parseTrainingJsonl,
  summarizeTrainingExamples,
} from "../training/schema";

function usage(): string {
  return [
    "Usage:",
    "  npm run training:validate -- <path-to-private-jsonl>",
    "",
    "The file is read locally and is never uploaded by this script.",
  ].join("\n");
}

async function main(): Promise<void> {
  const datasetPath = process.argv[2];

  if (!datasetPath || datasetPath === "--help") {
    console.log(usage());
    if (!datasetPath) {
      process.exitCode = 1;
    }
    return;
  }

  const contents = await readFile(resolve(process.cwd(), datasetPath), "utf8");
  const examples = parseTrainingJsonl(contents);
  const summary = summarizeTrainingExamples(examples);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "training dataset validation failed");
  process.exitCode = 1;
});
