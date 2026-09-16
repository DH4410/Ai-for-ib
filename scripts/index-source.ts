import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { createOpenAICompatibleBatchEmbedder } from "../lib/embedding-client";
import { resolveServerDatabaseKey } from "../lib/database/server-key";
import {
  STUDY_EMBEDDING_DIMENSION,
  SupabasePrivateStudyIndexRepository,
  type IndexedStudyChunk,
} from "../lib/indexing/repository";
import type { AssessedExtractedPage, IngestedContentChunk } from "../lib/ingestion/types";
import {
  appendManifestEvent,
  readManifestEvents,
} from "../lib/study-source/manifest";
import type {
  ManifestEvent,
  SourceDocument,
} from "../lib/study-source/types";
import type { TopicClassificationMethod } from "../lib/taxonomy/classify";

type CliArguments = {
  checksum?: string;
  inventoryPath: string;
  noEmbeddings: boolean;
  sourceId: string;
};

type ChunkArtifact = {
  checksumSha256: string;
  sourceId: string;
  chunks: Array<
    IngestedContentChunk & {
      topicClassification: {
        method: TopicClassificationMethod;
        reason: string;
      };
    }
  >;
};

type ExtractedArtifact = {
  checksumSha256: string;
  sourceId: string;
  pages: AssessedExtractedPage[];
};

type MaterializedEvent = Extract<
  ManifestEvent,
  { eventType: "materialized" }
>;

function usage(): string {
  return [
    "Usage:",
    "  npm run study:index -- --source-id <id> [--checksum <sha256>] [--inventory <metadata-json>] [--no-embeddings]",
    "",
    "Reads ignored local ingestion artifacts and loads them into the private Supabase study index.",
    "SUPABASE_URL and SUPABASE_SECRET_KEY are required (legacy SUPABASE_SERVICE_ROLE_KEY is also accepted).",
    "Embeddings are added when EMBEDDING_BASE_URL and EMBEDDING_MODEL are configured.",
  ].join("\n");
}

function readCliArguments(args: string[]): CliArguments {
  const values = new Map<string, string>();
  let noEmbeddings = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--no-embeddings") {
      noEmbeddings = true;
      continue;
    }

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
  if (!sourceId) {
    throw new Error("--source-id is required");
  }

  const checksum = values.get("--checksum");
  if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new Error("--checksum must be a SHA-256 checksum");
  }

  return {
    checksum,
    inventoryPath:
      values.get("--inventory") ??
      resolve(process.cwd(), "data", "source-inventory.example.json"),
    noEmbeddings,
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
    typeof record.title === "string" &&
    typeof record.filename === "string" &&
    typeof record.sourceProvider === "string" &&
    typeof record.sourceReference === "string"
  );
}

async function loadSourceDocument(
  inventoryPath: string,
  sourceId: string,
): Promise<SourceDocument> {
  const rawInventory = JSON.parse(await readFile(inventoryPath, "utf8")) as {
    records?: unknown;
  };

  if (!Array.isArray(rawInventory.records)) {
    throw new Error("inventory must contain a records array");
  }

  const source = rawInventory.records.find(
    (record): record is SourceDocument =>
      isSourceDocument(record) && record.id === sourceId,
  );

  if (!source) {
    throw new Error(`source ID was not found in the inventory: ${sourceId}`);
  }

  return source;
}

function latestChecksumForSource(
  events: ManifestEvent[],
  sourceId: string,
): string | undefined {
  return [...events].reverse().find(
    (
      event,
    ): event is Extract<
      ManifestEvent,
      { eventType: "materialized" | "duplicate" }
    > =>
      event.sourceId === sourceId &&
      (event.eventType === "materialized" || event.eventType === "duplicate"),
  )?.checksumSha256;
}

function materializedEventForChecksum(
  events: ManifestEvent[],
  checksumSha256: string,
): MaterializedEvent {
  const event = [...events].reverse().find(
    (candidate): candidate is MaterializedEvent =>
      candidate.eventType === "materialized" &&
      candidate.checksumSha256 === checksumSha256,
  );

  if (!event) {
    throw new Error(
      "no materialized manifest event exists for the selected checksum",
    );
  }

  return event;
}

async function readArtifact<T>(
  path: string,
  sourceId: string,
  checksumSha256: string,
): Promise<T> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as {
    sourceId?: unknown;
    checksumSha256?: unknown;
  };

  if (
    artifact.sourceId !== sourceId ||
    artifact.checksumSha256 !== checksumSha256
  ) {
    throw new Error(`private index artifact does not match source/checksum: ${path}`);
  }

  return artifact as T;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing environment variable: ${name}`);
  }
  return value;
}

async function addEmbeddings(
  chunks: ChunkArtifact["chunks"],
  noEmbeddings: boolean,
): Promise<IndexedStudyChunk[]> {
  const baseUrl = process.env.EMBEDDING_BASE_URL?.trim();
  const model = process.env.EMBEDDING_MODEL?.trim();

  if (noEmbeddings || (!baseUrl && !model)) {
    return chunks.map((chunk) => ({ ...chunk, embedding: null }));
  }

  if (!baseUrl || !model) {
    throw new Error(
      "set both EMBEDDING_BASE_URL and EMBEDDING_MODEL, or use --no-embeddings",
    );
  }

  const embedBatch = createOpenAICompatibleBatchEmbedder({
    apiKey: process.env.EMBEDDING_API_KEY?.trim() ?? "",
    baseUrl,
    model,
  });
  const result: IndexedStudyChunk[] = [];
  const batchSize = 16;

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const embeddings = await embedBatch(batch.map(({ text }) => text));

    embeddings.forEach((embedding, index) => {
      if (embedding.length !== STUDY_EMBEDDING_DIMENSION) {
        throw new Error(
          `embedding dimension mismatch: expected ${STUDY_EMBEDDING_DIMENSION}, got ${embedding.length}`,
        );
      }

      result.push({
        ...batch[index],
        embedding,
      });
    });
  }

  return result;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const args = readCliArguments(process.argv.slice(2));
  const source = await loadSourceDocument(args.inventoryPath, args.sourceId);
  const manifestPath = resolve(process.cwd(), "data", "source-manifest.jsonl");
  const events = await readManifestEvents(manifestPath);
  const checksumSha256 =
    args.checksum ?? latestChecksumForSource(events, args.sourceId);

  if (!checksumSha256) {
    throw new Error(
      "no local materialized version exists for this source; run study ingestion first",
    );
  }

  const materialized = materializedEventForChecksum(events, checksumSha256);
  const fileName = `${args.sourceId}--${checksumSha256}.json`;
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
  const extracted = await readArtifact<ExtractedArtifact>(
    extractedPath,
    args.sourceId,
    checksumSha256,
  );
  const chunkArtifact = await readArtifact<ChunkArtifact>(
    chunkPath,
    args.sourceId,
    checksumSha256,
  );
  const chunks = await addEmbeddings(chunkArtifact.chunks, args.noEmbeddings);

  const databaseKey =
    resolveServerDatabaseKey(process.env).key;
  if (!databaseKey) {
    throw new Error(
      "missing SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  const client = createClient(
    requiredEnvironment("SUPABASE_URL"),
    databaseKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const repository = new SupabasePrivateStudyIndexRepository(client);
  const result = await repository.replaceSource({
    chunks,
    pages: extracted.pages,
    source,
    version: {
      acquiredAt: materialized.occurredAt,
      byteCount: materialized.byteCount,
      checksumSha256,
      mimeType: materialized.mimeType,
      storagePath: materialized.localRelativePath,
    },
  });

  const embeddingCount = chunks.filter(({ embedding }) => embedding !== null).length;
  await appendManifestEvent(manifestPath, {
    checksumSha256,
    chunkCount: result.chunkCount,
    embeddingCount,
    eventType: "indexed",
    occurredAt: new Date().toISOString(),
    sourceId: source.id,
  });

  console.log(
    JSON.stringify(
      {
        checksumSha256,
        chunkCount: result.chunkCount,
        embeddingCount,
        pageCount: result.pageCount,
        sourceId: source.id,
        status: "indexed",
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "private study indexing failed");
  process.exitCode = 1;
});
