import {
  access,
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildProjectReadiness,
  type ReadinessSourceRecord,
} from "../lib/project-readiness";
import {
  readManifestEvents,
} from "../lib/study-source/manifest";
import type {
  StudyDocumentType,
  StudySourceSubject,
} from "../lib/study-source/types";
import {
  parseEvaluationJsonl,
} from "../training/evaluation";
import {
  parseTrainingJsonl,
  type TrainingExample,
} from "../training/schema";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadTraining(
  path: string,
): Promise<TrainingExample[] | undefined> {
  if (!(await exists(path))) {
    return undefined;
  }

  return parseTrainingJsonl(
    await readFile(path, "utf8"),
  );
}

async function loadBenchmark(path: string) {
  if (!(await exists(path))) {
    return undefined;
  }

  return parseEvaluationJsonl(
    await readFile(path, "utf8"),
  );
}

function sourceRecords(
  contents: string,
): ReadinessSourceRecord[] {
  const payload = JSON.parse(contents) as {
    records?: Array<{
      id?: unknown;
      subject?: unknown;
      documentType?: unknown;
    }>;
  };

  if (!Array.isArray(payload.records)) {
    throw new Error(
      "source inventory must contain records",
    );
  }

  return payload.records.map((record, index) => {
    if (
      typeof record.id !== "string" ||
      typeof record.subject !== "string" ||
      typeof record.documentType !== "string"
    ) {
      throw new Error(
        `invalid source inventory record at index ${index}`,
      );
    }

    return {
      documentType:
        record.documentType as StudyDocumentType,
      id: record.id,
      subject:
        record.subject as StudySourceSubject,
    };
  });
}

async function main(): Promise<void> {
  const root = process.cwd();
  const inventoryPath = resolve(
    root,
    "data/source-inventory.example.json",
  );
  const manifestPath = resolve(
    root,
    "data/source-manifest.jsonl",
  );
  const trainPath = resolve(
    root,
    "training/private-data/train.jsonl",
  );
  const validationPath = resolve(
    root,
    "training/private-data/validation.jsonl",
  );
  const benchmarkPath = resolve(
    root,
    "training/private-data/benchmark.jsonl",
  );

  const [
    inventoryContents,
    manifestEvents,
    train,
    validation,
    benchmark,
  ] = await Promise.all([
    readFile(inventoryPath, "utf8"),
    readManifestEvents(manifestPath),
    loadTraining(trainPath),
    loadTraining(validationPath),
    loadBenchmark(benchmarkPath),
  ]);

  const report = buildProjectReadiness({
    benchmark,
    manifestEvents,
    sources: sourceRecords(inventoryContents),
    train,
    validation,
  });

  console.log(JSON.stringify(report, null, 2));

  if (
    report.rag.failedSourceIds.length > 0 ||
    !report.training.privateFineTuneInputsReady
  ) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "project readiness report failed",
  );
  process.exitCode = 1;
});
