import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssessedExtractedPage,
  IngestedContentChunk,
} from "@/lib/ingestion/types";
import type { SourceDocument } from "@/lib/study-source/types";
import type { TopicClassificationMethod } from "@/lib/taxonomy/classify";

export const STUDY_EMBEDDING_DIMENSION = 1024;

export type IndexedStudyChunk = IngestedContentChunk & {
  embedding: number[] | null;
  topicClassification: {
    method: TopicClassificationMethod;
    reason: string;
  };
};

export type PrivateStudyIndexRequest = {
  source: SourceDocument;
  version: {
    acquiredAt: string;
    byteCount: number;
    checksumSha256: string;
    mimeType: string;
    storagePath: string;
  };
  pages: AssessedExtractedPage[];
  chunks: IndexedStudyChunk[];
};

export type PrivateStudyIndexResult = {
  documentId: string;
  documentVersionId: string;
  pageCount: number;
  chunkCount: number;
};

type RpcError = { message: string };

export type StudyIndexRpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

function assertEmbeddingDimensions(chunks: IndexedStudyChunk[]): void {
  for (const chunk of chunks) {
    if (
      chunk.embedding !== null &&
      chunk.embedding.length !== STUDY_EMBEDDING_DIMENSION
    ) {
      throw new Error(
        `chunk ${chunk.id} embedding must contain exactly ${STUDY_EMBEDDING_DIMENSION} values`,
      );
    }
    if (
      chunk.topicIds.length > 0 &&
      chunk.topicClassification.method === "unclassified"
    ) {
      throw new Error(
        `chunk ${chunk.id} cannot have topic IDs with an unclassified method`,
      );
    }
  }
}

function parseResult(value: unknown): PrivateStudyIndexResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("private study indexing returned an invalid result");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.document_id !== "string" ||
    typeof record.document_version_id !== "string" ||
    !Number.isSafeInteger(record.page_count) ||
    !Number.isSafeInteger(record.chunk_count)
  ) {
    throw new Error("private study indexing returned incomplete metadata");
  }

  return {
    chunkCount: record.chunk_count as number,
    documentId: record.document_id,
    documentVersionId: record.document_version_id,
    pageCount: record.page_count as number,
  };
}

export class SupabasePrivateStudyIndexRepository {
  private readonly client: StudyIndexRpcClient;

  constructor(client: SupabaseClient | StudyIndexRpcClient) {
    this.client = client as unknown as StudyIndexRpcClient;
  }

  async replaceSource(
    request: PrivateStudyIndexRequest,
  ): Promise<PrivateStudyIndexResult> {
    assertEmbeddingDimensions(request.chunks);

    const { data, error } = await this.client.rpc("index_private_study_source", {
      p_chunks: request.chunks.map((chunk) => ({
        classification_method: chunk.topicClassification.method,
        content: chunk.text,
        embedding: chunk.embedding,
        equation_references: chunk.equationReferences,
        figure_references: chunk.figureReferences,
        heading_path: chunk.headingPath,
        id: chunk.id,
        page_end: chunk.pageEnd,
        page_start: chunk.pageStart,
        subject: chunk.subject,
        title: chunk.title,
        topic_confidence: chunk.topicConfidence,
        topic_ids: chunk.topicIds,
      })),
      p_document: {
        author: request.source.author,
        copyright_status: request.source.copyrightStatus,
        document_type: request.source.documentType,
        filename: request.source.filename,
        publisher: request.source.publisher,
        source_id: request.source.id,
        source_provider: request.source.sourceProvider,
        source_reference: request.source.sourceReference,
        subject: request.source.subject,
        title: request.source.title,
        useful_for_knowledge_base: request.source.usefulForKnowledgeBase,
      },
      p_pages: request.pages.map((page) => ({
        extraction_method: page.extractionMethod,
        page_number: page.pageNumber,
        text_quality: page.textQuality,
      })),
      p_version: {
        acquired_at: request.version.acquiredAt,
        byte_count: request.version.byteCount,
        checksum_sha256: request.version.checksumSha256,
        mime_type: request.version.mimeType,
        storage_path: request.version.storagePath,
      },
    });

    if (error) {
      throw new Error(`private study indexing failed: ${error.message}`);
    }

    return parseResult(data);
  }
}
