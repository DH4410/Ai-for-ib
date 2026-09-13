import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { materializeLocalSource } from "@/lib/ingestion/materialize";
import { readManifestEvents } from "@/lib/study-source/manifest";
import type { SourceDocument } from "@/lib/study-source/types";

const temporaryDirectories: string[] = [];

const chemistryBook: SourceDocument = {
  author: null,
  copyrightStatus: "private-licensed",
  documentType: "textbook",
  filename: "HL_Chemistry_pearson_book_2025.pdf",
  id: "chemistry-pearson-2025",
  publisher: null,
  sourceProvider: "manual",
  sourceReference: "owned-test-fixture",
  subject: "chemistry",
  title: "Owned test chemistry book",
  usefulForKnowledgeBase: true,
};

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai-for-ib-materialize-"));
  temporaryDirectories.push(directory);

  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("local source materialization", () => {
  it("copies an authorized local file to a private subject directory and logs its checksum", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = join(directory, "owned-fixture.pdf");
    const manifestPath = join(directory, "source-manifest.jsonl");
    const privateSourcesRoot = join(directory, "private-sources");
    await writeFile(inputPath, "owned fixture content", "utf8");

    const result = await materializeLocalSource({
      inputPath,
      manifestPath,
      privateSourcesRoot,
      source: chemistryBook,
    });

    expect(result).toMatchObject({
      relativePath: "chemistry/chemistry-pearson-2025.pdf",
      status: "materialized",
    });
    expect(result.checksumSha256).toHaveLength(64);
    expect(await readManifestEvents(manifestPath)).toMatchObject([
      { eventType: "materialization_started" },
      { eventType: "materialized", localRelativePath: result.relativePath },
    ]);
  });

  it("records a duplicate instead of overwriting a matching source", async () => {
    const directory = await createTemporaryDirectory();
    const inputPath = join(directory, "owned-fixture.pdf");
    const manifestPath = join(directory, "source-manifest.jsonl");
    const privateSourcesRoot = join(directory, "private-sources");
    await writeFile(inputPath, "owned fixture content", "utf8");

    await materializeLocalSource({
      inputPath,
      manifestPath,
      privateSourcesRoot,
      source: chemistryBook,
    });
    const duplicate = await materializeLocalSource({
      inputPath,
      manifestPath,
      privateSourcesRoot,
      source: chemistryBook,
    });

    expect(duplicate.status).toBe("duplicate");
    expect((await readManifestEvents(manifestPath)).map(({ eventType }) => eventType)).toEqual([
      "materialization_started",
      "materialized",
      "materialization_started",
      "duplicate",
    ]);
  });
});
