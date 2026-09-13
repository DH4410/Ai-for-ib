import { mkdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { buildSemanticChunks, assessExtractedPage } from "@/lib/ingestion/chunks";
import { materializeLocalSource } from "@/lib/ingestion/materialize";
import { extractPdfPages } from "@/lib/ingestion/pdf";
import type {
  ExtractedPageInput,
  IngestLocalSourceRequest,
  IngestLocalSourceResult,
} from "@/lib/ingestion/types";
import { appendManifestEvent } from "@/lib/study-source/manifest";
import { classifyTopics } from "@/lib/taxonomy/classify";

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

function indexedFileName(sourceId: string, checksumSha256: string): string {
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
    const fileName = indexedFileName(request.source.id, materialization.checksumSha256);
    const extractedPath = resolve(
      privateIndexRoot,
      "extracted",
      request.source.subject,
      fileName,
    );
    const chunkPath = resolve(
      privateIndexRoot,
      "chunks",
      request.source.subject,
      fileName,
    );
    const reportPath = resolve(reportRoot, fileName);
    assertPathInsideRoot(privateIndexRoot, extractedPath);
    assertPathInsideRoot(privateIndexRoot, chunkPath);
    assertPathInsideRoot(reportRoot, reportPath);

    await mkdir(resolve(privateIndexRoot, "extracted", request.source.subject), {
      recursive: true,
    });
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

    const usablePages = assessedPages
      .filter(({ extractionMethod }) => extractionMethod === "text")
      .map(({ pageNumber, text }) => ({ pageNumber, text }));

    const chunks =
      request.source.subject === "ib"
        ? []
        : buildSemanticChunks(usablePages, {
            documentId: request.source.id,
            subject: request.source.subject,
          }).map((chunk) => {
            const classification = classifyTopics({
              subject: chunk.subject,
              text: chunk.text,
              title: chunk.title,
            });

            return {
              ...chunk,
              topicConfidence: classification.confidence,
              topicIds: classification.topicIds,
              topicClassification: {
                method: classification.method,
                reason: classification.reason,
              },
            };
          });

    await mkdir(resolve(privateIndexRoot, "chunks", request.source.subject), {
      recursive: true,
    });
    await writeFile(
      chunkPath,
      `${JSON.stringify(
        {
          checksumSha256: materialization.checksumSha256,
          chunks,
          documentId: request.source.id,
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
      chunkCount: chunks.length,
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
      chunkCount: chunks.length,
      eventType: "ingested",
      failedPageCount: 0,
      occurredAt: new Date().toISOString(),
      ocrRequiredPageCount,
      pageCount: assessedPages.length,
      sourceId: request.source.id,
    });

    return {
      ...materialization,
      chunkCount: chunks.length,
      chunkPath,
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
