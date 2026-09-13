import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendManifestEvent,
  findDuplicateByChecksum,
  latestMaterializationBySource,
  readManifestEvents,
} from "@/lib/study-source/manifest";

const checksum = "a".repeat(64);
const temporaryDirectories: string[] = [];

async function createManifestPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai-for-ib-manifest-"));
  temporaryDirectories.push(directory);

  return join(directory, "source-manifest.jsonl");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("source manifest", () => {
  it("keeps an append-only start and materialized history for a source", async () => {
    const manifestPath = await createManifestPath();

    await appendManifestEvent(manifestPath, {
      eventType: "materialization_started",
      occurredAt: "2026-09-13T15:00:00.000Z",
      sourceId: "chemistry-pearson-2025",
      sourceProvider: "managebac",
      sourceReference: "/student/classes/13128084/files/folder/2499868",
    });
    await appendManifestEvent(manifestPath, {
      byteCount: 1234,
      checksumSha256: checksum,
      eventType: "materialized",
      localRelativePath: "chemistry/chemistry-pearson-2025.pdf",
      mimeType: "application/pdf",
      occurredAt: "2026-09-13T15:01:00.000Z",
      sourceId: "chemistry-pearson-2025",
    });

    expect(await readManifestEvents(manifestPath)).toHaveLength(2);
    expect(
      await latestMaterializationBySource(manifestPath, "chemistry-pearson-2025"),
    ).toMatchObject({
      checksumSha256: checksum,
      eventType: "materialized",
    });
  });

  it("finds a materialized duplicate by checksum", async () => {
    const manifestPath = await createManifestPath();

    await appendManifestEvent(manifestPath, {
      byteCount: 1234,
      checksumSha256: checksum,
      eventType: "materialized",
      localRelativePath: "physics/physics-oxford-2023.pdf",
      mimeType: "application/pdf",
      occurredAt: "2026-09-13T15:01:00.000Z",
      sourceId: "physics-oxford-2023",
    });

    expect(await findDuplicateByChecksum(manifestPath, checksum)).toMatchObject({
      sourceId: "physics-oxford-2023",
    });
  });

  it("records safe indexing state without private source text", async () => {
    const manifestPath = await createManifestPath();

    await appendManifestEvent(manifestPath, {
      checksumSha256: checksum,
      chunkCount: 12,
      embeddingCount: 12,
      eventType: "indexed",
      occurredAt: "2026-09-13T18:30:00.000Z",
      sourceId: "physics-oxford-2023",
    });

    expect((await readManifestEvents(manifestPath)).at(-1)).toMatchObject({
      checksumSha256: checksum,
      chunkCount: 12,
      embeddingCount: 12,
      eventType: "indexed",
    });
  });

  it("rejects sensitive manifest fields before writing an event", async () => {
    const manifestPath = await createManifestPath();

    await expect(
      appendManifestEvent(manifestPath, {
        eventType: "materialized",
        sourceId: "chemistry-pearson-2025",
        sourceUrl: "https://example.invalid/one-time-token",
      }),
    ).rejects.toThrow("forbidden manifest key");

    expect(await readManifestEvents(manifestPath)).toEqual([]);
  });
});
