import { mkdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { assessExtractedPage } from "@/lib/ingestion/chunks";
import { materializeLocalSource } from "@/lib/ingestion/materialize";
import { extractPdfPages } from "@/lib/ingestion/pdf";
import type {
  ExtractedPageInput,
  IngestLocalSourceRequest,
  IngestLocalSourceResult,
} from "@/lib/ingestion/types";
import { appendManifestEvent } from "@/lib/study-source/manifest";

function assertPathInsideRoot(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);

  if (pathFromRoot.length === 0 || pathFromRoot.startsWith("..") || pathFromRoot.includes(":")) {
    throw new Error("ingestion output escapes its configured private root");
  }
}

function safeExtractionErrorSummary(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;

  return code ? `extraction filesystem error: ${code}` : "extraction failed";
}

function extractedFileName(sourceId: string, checksumSha256: string): string {
  return `${sourceId}--${checksumSha256}.json`;
}

export async function ingestLocalSource(
  request: IngestLocalSourceRequest,
): Promise<IngestLocalSourceResult> {
  const materialization = await materializeLocalSource(request);
  const privateSourcesRoot = resolve(request.privateSourcesRoot);
  const privateIndexRoot = resolve(request.privateIndexRoot);
  const reportRoot = resolve(request.reportRoot);
  const materializedPath = resolve(privateSourcesRoot, materialization.relativePath);
  assertPathInsideRoot(privateSourcesRoot, materializedPath);

  try {
    if (extname(materializedPath).toLowerCase() !== ".pdf") {
      throw new Error("the current text extractor supports PDF sources only");
    }

    const extractPages = request.extractPages ?? extractPdfPages;
    const pages = await extractPages(materializedPath);
    const assessedPages = pages.map(assessExtractedPage);
    const extractedPath = resolve(
      privateIndexRoot,
      "extracted",
      request.source.subject,
      extractedFileName(request.source.id, materialization.checksumSha256),
    );
    const reportPath = resolve(
      reportRoot,
      `${request.source.id}--${materialization.checksumSha256}.json`,
    );
    assertPathInsideRoot(privateIndexRoot, extractedPath);
    assertPathInsideRoot(reportRoot, reportPath);

    await mkdir(resolve(privateIndexRoot, "extracted", request.source.subject), { recursive: true });
    await writeFile(
      extractedPath,
      `${JSON.stringify(
        {
          checksumSha256: materialization.checksumSha256,
          documentId: request.source.id,
          pages: assessedPages,
          sourceId: request.source.id,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const ocrRequiredPageCount = assessedPages.filter(
      ({ extractionMethod }) => extractionMethod === "ocr_required",
    ).length;
    const report = {
      documentType: request.source.documentType,
      materializationStatus: materialization.status,
      ocrRequiredPageCount,
      pageCount: assessedPages.length,
      sourceId: request.source.id,
      subject: request.source.subject,
    };
    await mkdir(reportRoot, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await appendManifestEvent(request.manifestPath, {
      chunkCount: 0,
      eventType: "ingested",
      failedPageCount: 0,
      occurredAt: new Date().toISOString(),
      ocrRequiredPageCount,
      pageCount: assessedPages.length,
      sourceId: request.source.id,
    });

    return {
      ...materialization,
      extractedPath,
      ocrRequiredPageCount,
      pageCount: assessedPages.length,
      reportPath,
    };
  } catch (error) {
    await appendManifestEvent(request.manifestPath, {
      eventType: "failed",
      failureStage: "extraction",
      occurredAt: new Date().toISOString(),
      safeErrorSummary: safeExtractionErrorSummary(error),
      sourceId: request.source.id,
    });
    throw error;
  }
}

export type { ExtractedPageInput };
