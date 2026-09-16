import type { SupabaseClient } from "@supabase/supabase-js";

import type { PastPaperDocument } from "@/lib/past-papers/metadata";
import type { StructuredPastPaperQuestion } from "@/lib/past-papers/records";
import type { SourceDocument } from "@/lib/study-source/types";
import { expandIBDPTopicIds } from "@/lib/taxonomy/ibdp";

export type PastPaperVersionMetadata = {
  acquiredAt: string;
  byteCount: number;
  checksumSha256: string;
  mimeType: string;
  storagePath: string;
};

export type PastPaperIndexRequest = {
  questionSource: SourceDocument;
  questionDocument: PastPaperDocument;
  questionVersion: PastPaperVersionMetadata;
  markschemeSource?: SourceDocument;
  markschemeDocument?: PastPaperDocument;
  markschemeVersion?: PastPaperVersionMetadata;
  questions: StructuredPastPaperQuestion[];
};

export type PastPaperIndexResult = {
  questionDocumentId: string;
  markschemeDocumentId: string | null;
  questionCount: number;
  pairedQuestionCount: number;
};

type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function sourcePayload(
  source: SourceDocument,
  metadata: PastPaperDocument,
): Record<string, unknown> {
  return {
    author: source.author,
    copyright_status: source.copyrightStatus,
    document_kind: metadata.documentKind,
    document_type: source.documentType,
    filename: source.filename,
    language: metadata.language,
    level: metadata.level,
    paper: metadata.paper,
    publisher: source.publisher,
    session: metadata.session,
    source_id: source.id,
    source_provider: source.sourceProvider,
    source_reference: source.sourceReference,
    subject: source.subject,
    syllabus_version: metadata.syllabusVersion,
    timezone: metadata.timezone,
    title: source.title,
    useful_for_knowledge_base: source.usefulForKnowledgeBase,
    year: metadata.year,
  };
}

function versionPayload(
  version: PastPaperVersionMetadata,
): Record<string, unknown> {
  return {
    acquired_at: version.acquiredAt,
    byte_count: version.byteCount,
    checksum_sha256: version.checksumSha256,
    mime_type: version.mimeType,
    storage_path: version.storagePath,
  };
}

function parseResult(value: unknown): PastPaperIndexResult {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("past-paper indexing returned an invalid result");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.question_document_id !== "string" ||
    !Number.isSafeInteger(record.question_count) ||
    !Number.isSafeInteger(record.paired_question_count)
  ) {
    throw new Error(
      "past-paper indexing returned incomplete metadata",
    );
  }

  return {
    markschemeDocumentId:
      typeof record.markscheme_document_id === "string"
        ? record.markscheme_document_id
        : null,
    pairedQuestionCount:
      record.paired_question_count as number,
    questionCount: record.question_count as number,
    questionDocumentId:
      record.question_document_id as string,
  };
}

export class SupabasePastPaperIndexRepository {
  private readonly client: RpcClient;

  constructor(client: SupabaseClient | RpcClient) {
    this.client = client as unknown as RpcClient;
  }

  async replacePaper(
    request: PastPaperIndexRequest,
  ): Promise<PastPaperIndexResult> {
    const hasMarkscheme = Boolean(
      request.markschemeSource &&
        request.markschemeDocument &&
        request.markschemeVersion,
    );
    if (
      hasMarkscheme !==
      Boolean(
        request.markschemeSource ||
          request.markschemeDocument ||
          request.markschemeVersion,
      )
    ) {
      throw new Error(
        "markscheme source, metadata and version must be supplied together",
      );
    }

    const { data, error } = await this.client.rpc(
      "index_private_past_paper",
      {
        p_markscheme_document: hasMarkscheme
          ? sourcePayload(
              request.markschemeSource!,
              request.markschemeDocument!,
            )
          : null,
        p_markscheme_version: hasMarkscheme
          ? versionPayload(request.markschemeVersion!)
          : null,
        p_question_document: sourcePayload(
          request.questionSource,
          request.questionDocument,
        ),
        p_question_version: versionPayload(
          request.questionVersion,
        ),
        p_questions: request.questions.map((question) => ({
          asset_references: question.assetReferences,
          command_terms: question.commandTerms,
          id: question.id,
          marks: question.marks ?? null,
          markscheme_text: question.markschemeText,
          pairing_status: question.pairingStatus,
          page_end: question.pageEnd,
          page_start: question.pageStart,
          paper: question.paper,
          question_number: question.questionNumber,
          question_text: question.questionText,
          session: question.session,
          subquestion: question.subquestion ?? null,
          subject: question.subject,
          syllabus_version: question.syllabusVersion,
          timezone: question.timezone,
          topic_classification_method:
            question.topicClassificationMethod,
          topic_confidence: question.topicConfidence,
          topic_ids: expandIBDPTopicIds(
            question.topicIds,
          ),
          year: question.year,
          level: question.level,
        })),
      },
    );

    if (error) {
      throw new Error(
        `private past-paper indexing failed: ${error.message}`,
      );
    }

    return parseResult(data);
  }
}
