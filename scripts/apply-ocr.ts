import {
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  applyOcrReplacements,
  parseOcrReplacements,
} from "../lib/ingestion/ocr";
import {
  buildClassifiedChunksFromPages,
} from "../lib/ingestion/rebuild";
import type {
  AssessedExtractedPage,
} from "../lib/ingestion/types";
import {
  appendManifestEvent,
  readManifestEvents,
} from "../lib/study-source/manifest";
import type {
  ManifestEvent,
  SourceDocument,
} from "../lib/study-source/types";

type CliArgs = {
  checksum?: string;
  inventoryPath: string;
  ocrPath: string;
  sourceId: string;
};

type ExtractedArtifact = {
  checksumSha256: string;
  documentId: string;
  pages: AssessedExtractedPage[];
  sourceId: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run study:apply-ocr -- --source-id <id> --ocr <private-ocr-json> [--checksum <sha256>] [--inventory <metadata-json>]",
    "",
    "OCR JSON format:",
    '  {"pages":[{"pageNumber":2,"text":"..."}]}',
    "",
    "Only pages previously marked ocr_required can be replaced.",
    "The OCR input and rebuilt artifacts must remain outside public Git.",
  ].join("\n");
}

function parseArgs(args: string[]): CliArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    values.set(key, value);
    index += 1;
  }

  const sourceId = values.get("--source-id");
  const ocrPath = values.get("--ocr");
  if (!sourceId || !ocrPath) {
    throw new Error(
      "--source-id and --ocr are required",
    );
  }

  const checksum = values.get("--checksum");
  if (
    checksum &&
    !/^[a-f0-9]{64}$/i.test(checksum)
  ) {
    throw new Error(
      "--checksum must be a SHA-256 checksum",
    );
  }

  return {
    checksum,
    inventoryPath:
      values.get("--inventory") ??
      resolve(
        process.cwd(),
        "data",
        "source-inventory.example.json",
      ),
    ocrPath,
    sourceId,
  };
}

function isSourceDocument(
  value: unknown,
): value is SourceDocument {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const record =
    value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.subject === "string" &&
    typeof record.documentType === "string" &&
    typeof record.title === "string" &&
    typeof record.filename === "string" &&
    typeof record.sourceProvider === "string" &&
    typeof record.sourceReference === "string"
  );
}

async function loadSource(
  inventoryPath: string,
  sourceId: string,
): Promise<SourceDocument> {
  const payload = JSON.parse(
    await readFile(inventoryPath, "utf8"),
  ) as { records?: unknown };

  if (!Array.isArray(payload.records)) {
    throw new Error(
      "inventory must contain a records array",
    );
  }

  const source = payload.records.find(
    (record): record is SourceDocument =>
      isSourceDocument(record) &&
      record.id === sourceId,
  );
  if (!source) {
    throw new Error(
      `source ID was not found in the inventory: ${sourceId}`,
    );
  }

  return source;
}

function latestChecksum(
  events: ManifestEvent[],
  sourceId: string,
): string | undefined {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<
      ManifestEvent,
      {
        eventType:
          | "materialized"
          | "duplicate";
      }
    > =>
      event.sourceId === sourceId &&
      (event.eventType === "materialized" ||
        event.eventType === "duplicate"),
  )?.checksumSha256;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const args = parseArgs(
    process.argv.slice(2),
  );
  const manifestPath = resolve(
    process.cwd(),
    "data",
    "source-manifest.jsonl",
  );
  const events =
    await readManifestEvents(manifestPath);
  const checksumSha256 =
    args.checksum ??
    latestChecksum(events, args.sourceId);
  if (!checksumSha256) {
    throw new Error(
      "no materialized version exists for this source",
    );
  }

  const source = await loadSource(
    args.inventoryPath,
    args.sourceId,
  );
  const fileName =
    `${args.sourceId}--${checksumSha256}.json`;
  const extractedPath = resolve(
    process.cwd(),
    "private-index",
    "extracted",
    source.subject,
    fileName,
  );
  const chunkPath = resolve(
    process.cwd(),
    "private-index",
    "chunks",
    source.subject,
    fileName,
  );
  const reportPath = resolve(
    process.cwd(),
    "data",
    "ingestion-reports",
    fileName,
  );

  const extracted = JSON.parse(
    await readFile(extractedPath, "utf8"),
  ) as ExtractedArtifact;
  if (
    extracted.sourceId !== args.sourceId ||
    extracted.checksumSha256 !==
      checksumSha256
  ) {
    throw new Error(
      "extracted artifact does not match source/checksum",
    );
  }

  const replacements =
    parseOcrReplacements(
      JSON.parse(
        await readFile(
          resolve(process.cwd(), args.ocrPath),
          "utf8",
        ),
      ),
    );
  const pages = applyOcrReplacements(
    extracted.pages,
    replacements,
  );
  const chunks =
    buildClassifiedChunksFromPages(
      pages,
      source,
      checksumSha256,
    );

  const remainingOcrRequiredPageCount =
    pages.filter(
      ({ extractionMethod }) =>
        extractionMethod === "ocr_required",
    ).length;

  await writeFile(
    extractedPath,
    JSON.stringify(
      {
        ...extracted,
        pages,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeFile(
    chunkPath,
    JSON.stringify(
      {
        checksumSha256,
        chunks,
        documentId: source.id,
        sourceId: source.id,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        chunkCount: chunks.length,
        documentType:
          source.documentType,
        materializationStatus:
          "materialized",
        ocrAppliedPageCount:
          replacements.length,
        ocrRequiredPageCount:
          remainingOcrRequiredPageCount,
        pageCount: pages.length,
        sourceId: source.id,
        subject: source.subject,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  await appendManifestEvent(
    manifestPath,
    {
      chunkCount: chunks.length,
      eventType: "ingested",
      failedPageCount: 0,
      occurredAt:
        new Date().toISOString(),
      ocrRequiredPageCount:
        remainingOcrRequiredPageCount,
      pageCount: pages.length,
      sourceId: source.id,
    },
  );

  console.log(
    JSON.stringify(
      {
        chunkCount: chunks.length,
        ocrAppliedPageCount:
          replacements.length,
        ocrRequiredPageCount:
          remainingOcrRequiredPageCount,
        sourceId: source.id,
        status: "ocr_applied",
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
      : "OCR application failed",
  );
  process.exitCode = 1;
});
