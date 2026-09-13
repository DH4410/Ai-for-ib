import type { Subject } from "@/types/study";
import type { SourceDocument } from "@/lib/study-source/types";

export type PageExtractionMethod = "text" | "ocr_required" | "failed";

export type ExtractedPageInput = {
  pageNumber: number;
  text: string;
};

export type AssessedExtractedPage = ExtractedPageInput & {
  extractionMethod: PageExtractionMethod;
  textQuality: number;
};

export type IngestedContentChunk = {
  id: string;
  documentId: string;
  subject: Subject;
  title: string;
  headingPath: string[];
  pageStart: number;
  pageEnd: number;
  text: string;
  equationReferences: string[];
  figureReferences: string[];
  topicIds: string[];
  topicConfidence: number;
};

export type MaterializeLocalSourceRequest = {
  source: SourceDocument;
  inputPath: string;
  privateSourcesRoot: string;
  manifestPath: string;
};

export type MaterializeLocalSourceResult = {
  status: "materialized" | "duplicate";
  checksumSha256: string;
  byteCount: number;
  mimeType: string;
  relativePath: string;
};

export type IngestLocalSourceRequest = MaterializeLocalSourceRequest & {
  privateIndexRoot: string;
  reportRoot: string;
  extractPages?: (pdfPath: string) => Promise<ExtractedPageInput[]>;
};

export type IngestLocalSourceResult = MaterializeLocalSourceResult & {
  chunkCount: number;
  chunkPath: string;
  extractedPath: string;
  ocrRequiredPageCount: number;
  pageCount: number;
  reportPath: string;
};
