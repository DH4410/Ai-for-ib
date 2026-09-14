import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ingestLocalSource } from "../lib/ingestion/ingest";
import { verifyLocalFileHandoff } from "../lib/ingestion/handoff";
import type { SourceDocument } from "../lib/study-source/types";

type CliArguments = {
  expectedByteCount?: number;
  expectedSha256?: string;
  inputPath: string;
  inventoryPath: string;
  sourceId: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/ingest-source.ts --source-id <id> --input <local-file> [--inventory <metadata-json>] [--expected-sha256 <sha256>] [--expected-byte-count <bytes>]",
    "",
    "The input must be a file you normally downloaded or saved with authorized access.",
    "This command never accepts a URL and writes raw/extracted material only to ignored paths.",
  ].join("\n");
}

function readCliArguments(args: string[]): CliArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${argument}`);
    }

    values.set(argument, value);
    index += 1;
  }

  const sourceId = values.get("--source-id");
  const inputPath = values.get("--input");
  if (!sourceId || !inputPath) {
    throw new Error("--source-id and --input are required");
  }

  const expectedByteCountRaw =
    values.get("--expected-byte-count");
  const expectedByteCount =
    expectedByteCountRaw === undefined
      ? undefined
      : Number(expectedByteCountRaw);
  if (
    expectedByteCount !== undefined &&
    (!Number.isSafeInteger(expectedByteCount) ||
      expectedByteCount < 0)
  ) {
    throw new Error(
      "--expected-byte-count must be a non-negative integer",
    );
  }

  return {
    expectedByteCount,
    expectedSha256: values.get("--expected-sha256"),
    inputPath,
    inventoryPath:
      values.get("--inventory") ?? resolve(process.cwd(), "data", "source-inventory.example.json"),
    sourceId,
  };
}

function isSourceDocument(value: unknown): value is SourceDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.subject === "string" &&
    typeof record.documentType === "string" &&
    typeof record.filename === "string" &&
    typeof record.sourceProvider === "string" &&
    typeof record.sourceReference === "string"
  );
}

async function loadSourceDocument(inventoryPath: string, sourceId: string): Promise<SourceDocument> {
  const rawInventory = JSON.parse(await readFile(inventoryPath, "utf8")) as { records?: unknown };
  if (!Array.isArray(rawInventory.records)) {
    throw new Error("inventory must contain a records array");
  }

  const source = rawInventory.records.find(
    (record): record is SourceDocument => isSourceDocument(record) && record.id === sourceId,
  );
  if (!source) {
    throw new Error(`source ID was not found in the inventory: ${sourceId}`);
  }

  return source;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const {
    expectedByteCount,
    expectedSha256,
    inputPath,
    inventoryPath,
    sourceId,
  } = readCliArguments(process.argv.slice(2));
  const source = await loadSourceDocument(inventoryPath, sourceId);

  if (
    expectedByteCount !== undefined ||
    expectedSha256 !== undefined
  ) {
    await verifyLocalFileHandoff(inputPath, {
      byteCount: expectedByteCount,
      checksumSha256: expectedSha256,
    });
  }

  const result = await ingestLocalSource({
    inputPath,
    manifestPath: resolve(process.cwd(), "data", "source-manifest.jsonl"),
    privateIndexRoot: resolve(process.cwd(), "private-index"),
    privateSourcesRoot: resolve(process.cwd(), "private-sources"),
    reportRoot: resolve(process.cwd(), "data", "ingestion-reports"),
    source,
  });

  console.log(
    JSON.stringify(
      {
        checksumSha256: result.checksumSha256,
        chunkCount: result.chunkCount,
        ocrRequiredPageCount: result.ocrRequiredPageCount,
        pageCount: result.pageCount,
        sourceId,
        status: result.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "source ingestion failed");
  process.exitCode = 1;
});
