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
  renderAdapterReviewHtml,
  type AdapterComparisonReport,
} from "../training/review-report";

function outputPath(value: string): string {
  const root = resolve(
    process.cwd(),
    "training",
    "outputs",
  );
  const target = resolve(process.cwd(), value);
  const fromRoot = relative(root, target);

  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith("..") ||
    fromRoot.includes(":")
  ) {
    throw new Error(
      "review HTML must stay under training/outputs/",
    );
  }

  return target;
}

async function main(): Promise<void> {
  const input =
    process.argv[2] ??
    "training/outputs/adapter-comparison.json";
  const output = outputPath(
    process.argv[3] ??
      "training/outputs/adapter-review.html",
  );

  const report = JSON.parse(
    await readFile(
      resolve(process.cwd(), input),
      "utf8",
    ),
  ) as AdapterComparisonReport;

  const html = renderAdapterReviewHtml(report);
  await mkdir(dirname(output), {
    recursive: true,
  });
  await writeFile(output, html, "utf8");

  console.log(
    `Wrote private human-review page: ${relative(
      process.cwd(),
      output,
    )}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "adapter review rendering failed",
  );
  process.exitCode = 1;
});
