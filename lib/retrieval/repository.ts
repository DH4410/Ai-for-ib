import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrivateSupabaseServerClient } from "@/lib/database/supabase-server";
import type { StudyDocumentType } from "@/lib/study-source/types";
import type { Subject } from "@/types/study";

export type RetrievalRequest = {
  subject: Subject;
  documentTypes: StudyDocumentType[];
  query: string;
  limit: number;
  topicIds?: string[];
};

export type StoredSourceChunk = {
  id: string;
  documentId: string;
  documentType: StudyDocumentType;
  subject: Subject;
  title: string;
  locator: string;
  pageStart: number | null;
  pageEnd: number | null;
  text: string;
  topicIds: string[];
  vectorScore?: number;
};

export type RankedSourceChunk = StoredSourceChunk & {
  score: number;
};

export interface StudySourceRepository {
  searchLexical(request: RetrievalRequest): Promise<RankedSourceChunk[]>;
  searchVector(request: RetrievalRequest, embedding: number[]): Promise<RankedSourceChunk[]>;
}

function containsEveryTopic(chunk: StoredSourceChunk, topicIds: string[] | undefined): boolean {
  return !topicIds || topicIds.length === 0 || topicIds.every((topicId) => chunk.topicIds.includes(topicId));
}

function filterChunks(chunks: StoredSourceChunk[], request: RetrievalRequest): StoredSourceChunk[] {
  return chunks.filter(
    (chunk) =>
      chunk.subject === request.subject &&
      request.documentTypes.includes(chunk.documentType) &&
      containsEveryTopic(chunk, request.topicIds),
  );
}

function queryTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
}

function lexicalScore(chunk: StoredSourceChunk, terms: string[]): number {
  const searchableText = `${chunk.title} ${chunk.text}`.toLocaleLowerCase();

  return terms.reduce((score, term) => score + (searchableText.split(term).length - 1), 0);
}

function capAndSort(chunks: RankedSourceChunk[], limit: number): RankedSourceChunk[] {
  return [...chunks]
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export class InMemoryStudySourceRepository implements StudySourceRepository {
  constructor(private readonly chunks: StoredSourceChunk[]) {}

  async searchLexical(request: RetrievalRequest): Promise<RankedSourceChunk[]> {
    const terms = queryTerms(request.query);
    const candidates = filterChunks(this.chunks, request)
      .map((chunk) => ({ ...chunk, score: lexicalScore(chunk, terms) }))
      .filter(({ score }) => terms.length === 0 || score > 0);

    return capAndSort(candidates, request.limit);
  }

  async searchVector(request: RetrievalRequest, _embedding: number[]): Promise<RankedSourceChunk[]> {
    const candidates = filterChunks(this.chunks, request).map((chunk) => ({
      ...chunk,
      score: chunk.vectorScore ?? 0,
    }));

    return capAndSort(candidates, request.limit);
  }
}

type RpcRow = {
  id: string;
  document_id: string;
  document_type: StudyDocumentType;
  subject: Subject;
  title: string;
  locator: string;
  page_start: number | null;
  page_end: number | null;
  text: string;
  topic_ids: string[] | null;
  score: number;
};

type RpcClient = {
  rpc: (name: string, parameters: Record<string, unknown>) => Promise<{ data: RpcRow[] | null; error: Error | null }>;
};

function toRankedSourceChunk(row: RpcRow): RankedSourceChunk {
  return {
    documentId: row.document_id,
    documentType: row.document_type,
    id: row.id,
    locator: row.locator,
    pageEnd: row.page_end,
    pageStart: row.page_start,
    score: row.score,
    subject: row.subject,
    text: row.text,
    title: row.title,
    topicIds: row.topic_ids ?? [],
  };
}

export class SupabaseStudySourceRepository implements StudySourceRepository {
  private readonly client: RpcClient;

  constructor(client: SupabaseClient = getPrivateSupabaseServerClient()) {
    this.client = client as unknown as RpcClient;
  }

  async searchLexical(request: RetrievalRequest): Promise<RankedSourceChunk[]> {
    const { data, error } = await this.client.rpc("search_private_study_chunks", {
      p_document_types: request.documentTypes,
      p_limit: request.limit,
      p_query: request.query,
      p_subject: request.subject,
      p_topic_ids: request.topicIds ?? [],
    });
    if (error) {
      throw new Error(`private lexical retrieval failed: ${error.message}`);
    }

    return (data ?? []).map(toRankedSourceChunk);
  }

  async searchVector(request: RetrievalRequest, embedding: number[]): Promise<RankedSourceChunk[]> {
    const { data, error } = await this.client.rpc("search_private_study_chunks_vector", {
      p_document_types: request.documentTypes,
      p_embedding: embedding,
      p_limit: request.limit,
      p_subject: request.subject,
      p_topic_ids: request.topicIds ?? [],
    });
    if (error) {
      throw new Error(`private vector retrieval failed: ${error.message}`);
    }

    return (data ?? []).map(toRankedSourceChunk);
  }
}
