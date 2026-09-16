import {
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import type {
  AssessedExtractedPage,
  IngestedContentChunk,
} from "../lib/ingestion/types";
import {
  readManifestEvents,
} from "../lib/study-source/manifest";
import type {
  ManifestEvent,
  SourceDocument,
} from "../lib/study-source/types";

type CliArguments = {
  checksum?: string;
  inventoryPath: string;
  sourceId: string;
};

type ChunkArtifact = {
  checksumSha256: string;
  sourceId: string;
  chunks: Array<
    IngestedContentChunk & {
      topicClassification?: {
        method?: string;
      };
    }
  >;
};

type ExtractedArtifact = {
  checksumSha256: string;
  sourceId: string;
  pages: AssessedExtractedPage[];
};

function readArgs(
  args: string[],
): CliArguments {
  const values = new Map<string, string>();

  for (
    let index = 0;
    index < args.length;
    index += 1
  ) {
    const key = args[index];
    if (!key.startsWith("--")) {
      throw new Error(
        `unexpected argument: ${key}`,
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(
        `missing value for ${key}`,
      );
    }
    values.set(key, value);
    index += 1;
  }

  const sourceId = values.get("--source-id");
  if (!sourceId) {
    throw new Error(
      "--source-id is required",
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
    typeof record.documentType ===
      "string"
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
      `source ID not found: ${sourceId}`,
    );
  }
  return source;
}

function latestChecksum(
  events: ManifestEvent[],
  sourceId: string,
): string | undefined {
  return [...events]
    .reverse()
    .find(
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
        (event.eventType ===
          "materialized" ||
          event.eventType === "duplicate"),
    )?.checksumSha256;
}

function pageRange(
  start: number,
  end: number,
): string {
  return start === end
    ? `p.${start}`
    : `pp.${start}-${end}`;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      [
        "Usage:",
        "  npm run study:inspect -- --source-id <id> [--checksum <sha256>] [--inventory <metadata-json>]",
        "",
        "Prints metadata/counts/topic IDs/page ranges only. It never prints extracted source text.",
      ].join("\n"),
    );
    return;
  }

  const args = readArgs(
    process.argv.slice(2),
  );
  const source = await loadSource(
    args.inventoryPath,
    args.sourceId,
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

  const fileName =
    `${args.sourceId}--${checksumSha256}.json`;
  const [chunks, extracted] =
    await Promise.all([
      readFile(
        resolve(
          process.cwd(),
          "private-index",
          "chunks",
          source.subject,
          fileName,
        ),
        "utf8",
      ).then(
        (value) =>
          JSON.parse(value) as ChunkArtifact,
      ),
      readFile(
        resolve(
          process.cwd(),
          "private-index",
          "extracted",
          source.subject,
          fileName,
        ),
        "utf8",
      ).then(
        (value) =>
          JSON.parse(
            value,
          ) as ExtractedArtifact,
      ),
    ]);

  if (
    chunks.sourceId !== args.sourceId ||
    extracted.sourceId !== args.sourceId ||
    chunks.checksumSha256 !==
      checksumSha256 ||
    extracted.checksumSha256 !==
      checksumSha256
  ) {
    throw new Error(
      "private artifacts do not match the requested source/checksum",
    );
  }

  const topicCounts = new Map<
    string,
    number
  >();
  const methodCounts = new Map<
    string,
    number
  >();
  const unclassifiedRanges: string[] = [];

  for (const chunk of chunks.chunks) {
    const method =
      chunk.topicClassification?.method ??
      (chunk.topicIds.length > 0
        ? "unknown"
        : "unclassified");
    methodCounts.set(
      method,
      (methodCounts.get(method) ?? 0) +
        1,
    );

    if (chunk.topicIds.length === 0) {
      unclassifiedRanges.push(
        pageRange(
          chunk.pageStart,
          chunk.pageEnd,
        ),
      );
      continue;
    }

    for (const topicId of chunk.topicIds) {
      topicCounts.set(
        topicId,
        (topicCounts.get(topicId) ?? 0) +
          1,
      );
    }
  }

  const classifiedChunkCount =
    chunks.chunks.filter(
      ({ topicIds }) =>
        topicIds.length > 0,
    ).length;
  const ocrRequiredPages =
    extracted.pages
      .filter(
        ({ extractionMethod }) =>
          extractionMethod ===
          "ocr_required",
      )
      .map(({ pageNumber }) => pageNumber);

  console.log(
    JSON.stringify(
      {
        checksumSha256,
        chunkCount:
          chunks.chunks.length,
        classifiedChunkCount,
        classificationCoverage:
          chunks.chunks.length === 0
            ? 0
            : classifiedChunkCount /
              chunks.chunks.length,
        classificationMethods:
          Object.fromEntries(
            [...methodCounts].sort(
              ([left], [right]) =>
                left.localeCompare(right),
            ),
          ),
        ocrRequiredPageCount:
          ocrRequiredPages.length,
        ocrRequiredPages,
        sourceId: args.sourceId,
        subject: source.subject,
        topicCounts:
          Object.fromEntries(
            [...topicCounts].sort(
              ([left], [right]) =>
                left.localeCompare(right),
            ),
          ),
        unclassifiedChunkCount:
          chunks.chunks.length -
          classifiedChunkCount,
        unclassifiedPageRanges: [
          ...new Set(
            unclassifiedRanges,
          ),
        ],
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
      : "source inspection failed",
  );
  process.exitCode = 1;
});
