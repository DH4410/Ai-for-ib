import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ingestLocalSource } from "@/lib/ingestion/ingest";
import { readManifestEvents } from "@/lib/study-source/manifest";
import type { SourceDocument } from "@/lib/study-source/types";

const temporaryDirectories: string[] = [];

const physicsBook: SourceDocument = {
  author: null,
  copyrightStatus: "private-licensed",
  documentType: "textbook",
  filename: "physics-book.pdf",
  id: "physics-oxford-2023",
  publisher: null,
  sourceProvider: "manual",
  sourceReference: "owned-test-fixture",
  subject: "physics",
  title: "Owned test physics book",
  usefulForKnowledgeBase: true,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("local source ingestion", () => {
  it("writes extracted text privately but reports only safe page counts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-for-ib-ingest-"));
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "owned-fixture.pdf");
    await writeFile(inputPath, "owned fixture file", "utf8");

    const result = await ingestLocalSource({
      extractPages: async () => [
        { pageNumber: 1, text: "Readable owned fixture text ".repeat(4) },
        { pageNumber: 2, text: "" },
      ],
      inputPath,
      manifestPath: join(directory, "source-manifest.jsonl"),
      privateIndexRoot: join(directory, "private-index"),
      privateSourcesRoot: join(directory, "private-sources"),
      reportRoot: join(directory, "ingestion-reports"),
      source: physicsBook,
    });

    const extracted = JSON.parse(await readFile(result.extractedPath, "utf8")) as {
      pages: Array<{ text: string }>;
    };
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as Record<string, unknown>;

    expect(extracted.pages[0]?.text).toContain("Readable owned fixture text");
    expect(report).toMatchObject({
      ocrRequiredPageCount: 1,
      pageCount: 2,
      sourceId: "physics-oxford-2023",
    });
    expect(report).not.toHaveProperty("pages");
    expect((await readManifestEvents(join(directory, "source-manifest.jsonl"))).at(-1)).toMatchObject({
      eventType: "ingested",
      ocrRequiredPageCount: 1,
    });
  });
});
