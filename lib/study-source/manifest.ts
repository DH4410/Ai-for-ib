import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ManifestEvent } from "@/lib/study-source/types";

const FORBIDDEN_KEY_PATTERN = /url|token|cookie|authorization|text/i;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,127}$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSafeManifestData(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafeManifestData);
    return;
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && /^(?:https?|ftp):\/\//i.test(value)) {
      throw new Error("forbidden manifest URL value");
    }

    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new Error(`forbidden manifest key: ${key}`);
    }

    assertSafeManifestData(nestedValue);
  }
}

function assertStringField(record: UnknownRecord, key: string): asserts record is UnknownRecord & Record<string, string> {
  if (typeof record[key] !== "string" || record[key].trim().length === 0) {
    throw new Error(`manifest ${key} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(record: UnknownRecord, key: string): void {
  if (!Number.isSafeInteger(record[key]) || (record[key] as number) < 0) {
    throw new Error(`manifest ${key} must be a non-negative integer`);
  }
}

function assertIsoTimestamp(record: UnknownRecord): void {
  assertStringField(record, "occurredAt");

  if (Number.isNaN(Date.parse(record.occurredAt))) {
    throw new Error("manifest occurredAt must be an ISO timestamp");
  }
}

function assertSafeRelativePath(path: string): void {
  const normalizedPath = path.replaceAll("\\", "/");

  if (
    normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../") ||
    normalizedPath.includes(":")
  ) {
    throw new Error("manifest localRelativePath must remain relative");
  }
}

function assertManifestEvent(value: unknown): asserts value is ManifestEvent {
  assertSafeManifestData(value);

  if (!isRecord(value)) {
    throw new Error("manifest event must be an object");
  }

  assertStringField(value, "eventType");
  assertStringField(value, "sourceId");
  assertIsoTimestamp(value);

  if (!SOURCE_ID_PATTERN.test(value.sourceId)) {
    throw new Error("manifest sourceId must be a stable lowercase identifier");
  }

  switch (value.eventType) {
    case "materialization_started":
      assertStringField(value, "sourceProvider");
      assertStringField(value, "sourceReference");
      return;
    case "materialized":
      assertNonNegativeInteger(value, "byteCount");
      assertStringField(value, "checksumSha256");
      assertStringField(value, "localRelativePath");
      assertStringField(value, "mimeType");
      assertSafeRelativePath(value.localRelativePath);

      if (!SHA_256_PATTERN.test(value.checksumSha256)) {
        throw new Error("manifest checksumSha256 must be a SHA-256 checksum");
      }

      return;
    case "duplicate":
      assertStringField(value, "checksumSha256");
      assertStringField(value, "duplicateOfSourceId");
      return;
    case "failed":
      assertStringField(value, "failureStage");
      assertStringField(value, "safeErrorSummary");
      return;
    case "ingested":
      assertNonNegativeInteger(value, "chunkCount");
      if (value.classifiedChunkCount !== undefined) {
        assertNonNegativeInteger(
          value,
          "classifiedChunkCount",
        );
      }
      if (value.unclassifiedChunkCount !== undefined) {
        assertNonNegativeInteger(
          value,
          "unclassifiedChunkCount",
        );
      }
      assertNonNegativeInteger(value, "failedPageCount");
      assertNonNegativeInteger(value, "ocrRequiredPageCount");
      assertNonNegativeInteger(value, "pageCount");
      return;
    case "indexed":
      assertStringField(value, "checksumSha256");
      assertNonNegativeInteger(value, "chunkCount");
      assertNonNegativeInteger(value, "embeddingCount");

      if (!SHA_256_PATTERN.test(value.checksumSha256)) {
        throw new Error("manifest checksumSha256 must be a SHA-256 checksum");
      }

      return;
    default:
      throw new Error(`unsupported manifest event type: ${value.eventType}`);
  }
}

export async function appendManifestEvent(
  manifestPath: string,
  event: unknown,
): Promise<ManifestEvent> {
  assertManifestEvent(event);
  await mkdir(dirname(manifestPath), { recursive: true });
  await appendFile(manifestPath, `${JSON.stringify(event)}\n`, "utf8");

  return event;
}

export async function readManifestEvents(manifestPath: string): Promise<ManifestEvent[]> {
  let contents: string;

  try {
    contents = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return contents.split(/\r?\n/).reduce<ManifestEvent[]>((events, line, index) => {
    if (line.trim().length === 0) {
      return events;
    }

    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(line);
    } catch {
      throw new Error(`invalid manifest JSON on line ${index + 1}`);
    }

    try {
      assertManifestEvent(parsedEvent);
    } catch (error) {
      throw new Error(`invalid manifest event on line ${index + 1}: ${(error as Error).message}`);
    }

    events.push(parsedEvent);
    return events;
  }, []);
}

export async function latestMaterializationBySource(
  manifestPath: string,
  sourceId: string,
): Promise<ManifestEvent | undefined> {
  const events = await readManifestEvents(manifestPath);

  return [...events]
    .reverse()
    .find(
      (event) =>
        event.sourceId === sourceId &&
        ["materialization_started", "materialized", "duplicate", "failed"].includes(
          event.eventType,
        ),
    );
}

export async function findDuplicateByChecksum(
  manifestPath: string,
  checksumSha256: string,
): Promise<Extract<ManifestEvent, { eventType: "materialized" }> | undefined> {
  const events = await readManifestEvents(manifestPath);

  return events.find(
    (event): event is Extract<ManifestEvent, { eventType: "materialized" }> =>
      event.eventType === "materialized" && event.checksumSha256 === checksumSha256,
  );
}
