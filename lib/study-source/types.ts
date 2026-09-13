import type { Subject } from "@/types/study";

export type StudySourceSubject = Subject | "ib";

export type StudyDocumentType =
  | "textbook"
  | "study-guide"
  | "workbook"
  | "worksheet"
  | "syllabus"
  | "data-booklet"
  | "notes"
  | "question-paper"
  | "markscheme"
  | "specimen-paper"
  | "other";

export type SourceProvider = "managebac" | "ibdocs" | "manual";

export type SourceDocument = {
  id: string;
  subject: StudySourceSubject;
  documentType: StudyDocumentType;
  title: string;
  filename: string;
  author: string | null;
  publisher: string | null;
  sourceProvider: SourceProvider;
  sourceReference: string;
  usefulForKnowledgeBase: boolean;
  copyrightStatus: "private-licensed" | "user-provided" | "unknown";
};

type ManifestEventBase = {
  occurredAt: string;
  sourceId: string;
};

export type MaterializationStartedEvent = ManifestEventBase & {
  eventType: "materialization_started";
  sourceProvider: SourceProvider;
  sourceReference: string;
};

export type MaterializedEvent = ManifestEventBase & {
  eventType: "materialized";
  byteCount: number;
  checksumSha256: string;
  localRelativePath: string;
  mimeType: string;
};

export type DuplicateEvent = ManifestEventBase & {
  eventType: "duplicate";
  checksumSha256: string;
  duplicateOfSourceId: string;
};

export type FailedEvent = ManifestEventBase & {
  eventType: "failed";
  failureStage: "validation" | "materialization" | "inspection" | "extraction" | "indexing";
  safeErrorSummary: string;
};

export type IngestedEvent = ManifestEventBase & {
  eventType: "ingested";
  chunkCount: number;
  failedPageCount: number;
  ocrRequiredPageCount: number;
  pageCount: number;
};

export type ManifestEvent =
  | MaterializationStartedEvent
  | MaterializedEvent
  | DuplicateEvent
  | FailedEvent
  | IngestedEvent;
