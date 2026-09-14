import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  relative,
  resolve,
} from "node:path";

import {
  splitSftExamples,
  summarizeSftSplit,
} from "../training/sft-split";
import {
  parseTrainingJsonl,
  type TrainingExample,
} from "../training/schema";

function privateOutputPath(
  value: string,
): string {
  const root = resolve(
    process.cwd(),
    "training",
    "private-data",
  );
  const target = resolve(process.cwd(), value);
  const fromRoot = relative(root, target);

  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith("..") ||
    fromRoot.includes(":")
  ) {
    throw new Error(
      "SFT split outputs must be files under training/private-data/",
    );
  }

  return target;
}

function toJsonl(
  examples: TrainingExample[],
): string {
  return (
    examples
      .map((example) => JSON.stringify(example))
      .join("\n") + "\n"
  );
}

function ratioArg(): number {
  const index =
    process.argv.indexOf("--validation-ratio");
  if (index < 0) {
    return 0.1;
  }

  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) {
    throw new Error(
      "--validation-ratio requires a number",
    );
  }
  return value;
}

async function main(): Promise<void> {
  const input = process.argv[2];

  if (!input || input === "--help") {
    console.log(
      [
        "Usage:",
        "  npm run training:split-sft -- <all-behavior.jsonl> [--validation-ratio 0.1]",
        "",
        "Outputs:",
        "  training/private-data/train.jsonl",
        "  training/private-data/validation.jsonl",
        "",
        "The split is deterministic and stratified by subject × mode.",
      ].join("\n"),
    );
    if (!input) {
      process.exitCode = 1;
    }
    return;
  }

  const examples = parseTrainingJsonl(
    await readFile(
      resolve(process.cwd(), input),
      "utf8",
    ),
  );
  const split = splitSftExamples(
    examples,
    ratioArg(),
  );

  const trainPath = privateOutputPath(
    "training/private-data/train.jsonl",
  );
  const validationPath = privateOutputPath(
    "training/private-data/validation.jsonl",
  );

  await Promise.all([
    mkdir(dirname(trainPath), {
      recursive: true,
    }),
    mkdir(dirname(validationPath), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      trainPath,
      toJsonl(split.train),
      "utf8",
    ),
    writeFile(
      validationPath,
      toJsonl(split.validation),
      "utf8",
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        ...summarizeSftSplit(split),
        trainPath: relative(
          process.cwd(),
          trainPath,
        ),
        validationPath: relative(
          process.cwd(),
          validationPath,
        ),
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
      : "SFT split failed",
  );
  process.exitCode = 1;
});
