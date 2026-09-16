import { buildSemanticChunks } from "@/lib/ingestion/chunks";
import type {
  AssessedExtractedPage,
  IngestedContentChunk,
} from "@/lib/ingestion/types";
import type { SourceDocument } from "@/lib/study-source/types";
import { classifyTopics } from "@/lib/taxonomy/classify";

export type ClassifiedIngestedContentChunk =
  IngestedContentChunk & {
    topicClassification: {
      method: ReturnType<
        typeof classifyTopics
      >["method"];
      reason: string;
    };
  };

export function buildClassifiedChunksFromPages(
  pages: AssessedExtractedPage[],
  source: SourceDocument,
  checksumSha256: string,
): ClassifiedIngestedContentChunk[] {
  if (source.subject === "ib") {
    return [];
  }

  const usablePages = pages
    .filter(
      ({ extractionMethod }) =>
        extractionMethod === "text" ||
        extractionMethod === "ocr",
    )
    .map(({ pageNumber, text }) => ({
      pageNumber,
      text,
    }));

  return buildSemanticChunks(usablePages, {
    documentId: source.id,
    subject: source.subject,
  }).map((chunk) => {
    const classification = classifyTopics({
      subject: chunk.subject,
      text: chunk.text,
      title: chunk.title,
    });

    return {
      ...chunk,
      id: `${chunk.id}--${checksumSha256.slice(0, 12)}`,
      topicConfidence: classification.confidence,
      topicIds: classification.topicIds,
      topicClassification: {
        method: classification.method,
        reason: classification.reason,
      },
    };
  });
}
