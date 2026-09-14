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

export type PastPaperRetrievalRequest = {
  subject: Subject;
  query: string;
  limit: number;
  topicIds?: string[];
  years?: number[];
  paper?: string;
  pairedOnly?: boolean;
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

export type StoredPastPaperQuestion = {
  id: string;
  documentId: string;
  subject: Subject;
  title: string;
  locator: string;
  questionText: string;
  markschemeText: string | null;
  topicIds: string[];
  year: number;
  paper: string;
  questionNumber: string;
  marks: number | null;
  pairingStatus: "paired" | "question_only" | "ambiguous";
  score?: number;
};

export type RankedSourceChunk = StoredSourceChunk & {
  score: number;
};

export type RankedPastPaperQuestion = StoredPastPaperQuestion & {
  score: number;
};

export interface StudySourceRepository {
  searchLexical(request: RetrievalRequest): Promise<RankedSourceChunk[]>;
  searchVector(request: RetrievalRequest, embedding: number[]): Promise<RankedSourceChunk[]>;
  searchPastPaperQuestions(
    request: PastPaperRetrievalRequest,
  ): Promise<RankedPastPaperQuestion[]>;
  getPastPaperQuestion(
    questionId: string,
  ): Promise<RankedPastPaperQuestion | null>;
}

function containsEveryTopic(
  topicIds: string[],
  requiredTopicIds: string[] | undefined,
): boolean {
  return (
    !requiredTopicIds ||
    requiredTopicIds.length === 0 ||
    requiredTopicIds.every((topicId) => topicIds.includes(topicId))
  );
}

function filterChunks(
  chunks: StoredSourceChunk[],
  request: RetrievalRequest,
): StoredSourceChunk[] {
  return chunks.filter(
    (chunk) =>
      chunk.subject === request.subject &&
      request.documentTypes.includes(chunk.documentType) &&
      containsEveryTopic(chunk.topicIds, request.topicIds),
  );
}

function filterPastPapers(
  questions: StoredPastPaperQuestion[],
  request: PastPaperRetrievalRequest,
): StoredPastPaperQuestion[] {
  const normalizedPaper = request.paper?.toLocaleLowerCase();

  return questions.filter(
    (question) =>
      question.subject === request.subject &&
      (!request.years ||
        request.years.length === 0 ||
        request.years.includes(question.year)) &&
      (!normalizedPaper ||
        question.paper.toLocaleLowerCase() === normalizedPaper) &&
      (!request.pairedOnly || question.pairingStatus === "paired") &&
      containsEveryTopic(question.topicIds, request.topicIds),
  );
}

function queryTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
}

function lexicalScore(text: string, terms: string[]): number {
  const searchableText = text.toLocaleLowerCase();

  return terms.reduce(
    (score, term) => score + (searchableText.split(term).length - 1),
    0,
  );
}

function capAndSort(
  chunks: RankedSourceChunk[],
  limit: number,
): RankedSourceChunk[] {
  return [...chunks]
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

function capAndSortPastPapers(
  questions: RankedPastPaperQuestion[],
  limit: number,
): RankedPastPaperQuestion[] {
  return [...questions]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.year - left.year ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export class InMemoryStudySourceRepository implements StudySourceRepository {
  constructor(
    private readonly chunks: StoredSourceChunk[],
    private readonly pastPaperQuestions: StoredPastPaperQuestion[] = [],
  ) {}

  async searchLexical(
    request: RetrievalRequest,
  ): Promise<RankedSourceChunk[]> {
    const terms = queryTerms(request.query);
    const candidates = filterChunks(this.chunks, request)
      .map((chunk) => ({
        ...chunk,
        score: lexicalScore(`${chunk.title} ${chunk.text}`, terms),
      }))
      .filter(({ score }) => terms.length === 0 || score > 0);

    return capAndSort(candidates, request.limit);
  }

  async searchVector(
    request: RetrievalRequest,
    _embedding: number[],
  ): Promise<RankedSourceChunk[]> {
    const candidates = filterChunks(this.chunks, request).map((chunk) => ({
      ...chunk,
      score: chunk.vectorScore ?? 0,
    }));

    return capAndSort(candidates, request.limit);
  }

  async searchPastPaperQuestions(
    request: PastPaperRetrievalRequest,
  ): Promise<RankedPastPaperQuestion[]> {
    const terms = queryTerms(request.query);
    const candidates = filterPastPapers(this.pastPaperQuestions, request).map(
      (question) => ({
        ...question,
        score:
          question.score ??
          lexicalScore(
            `${question.title} ${question.locator} ${question.questionText}`,
            terms,
          ),
      }),
    );

    return capAndSortPastPapers(candidates, request.limit);
  }

  async getPastPaperQuestion(
    questionId: string,
  ): Promise<RankedPastPaperQuestion | null> {
    const question = this.pastPaperQuestions.find(
      ({ id }) => id === questionId,
    );

    return question
      ? {
          ...question,
          score: question.score ?? 1,
        }
      : null;
  }
}

type RpcChunkRow = {
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

type RpcPastPaperRow = {
  id: string;
  document_id: string;
  subject: Subject;
  title: string;
  locator: string;
  question_text: string;
  markscheme_text: string | null;
  topic_ids: string[] | null;
  year: number;
  paper: string;
  question_number: string;
  marks: number | null;
  pairing_status: "paired" | "question_only" | "ambiguous";
  score: number;
};

type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function toRankedSourceChunk(row: RpcChunkRow): RankedSourceChunk {
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

function toRankedPastPaperQuestion(
  row: RpcPastPaperRow,
): RankedPastPaperQuestion {
  return {
    documentId: row.document_id,
    id: row.id,
    locator: row.locator,
    marks: row.marks,
    markschemeText: row.markscheme_text,
    pairingStatus: row.pairing_status,
    paper: row.paper,
    questionNumber: row.question_number,
    questionText: row.question_text,
    score: row.score,
    subject: row.subject,
    title: row.title,
    topicIds: row.topic_ids ?? [],
    year: row.year,
  };
}

export class SupabaseStudySourceRepository implements StudySourceRepository {
  private readonly client: RpcClient;

  constructor(client: SupabaseClient = getPrivateSupabaseServerClient()) {
    this.client = client as unknown as RpcClient;
  }

  async searchLexical(
    request: RetrievalRequest,
  ): Promise<RankedSourceChunk[]> {
    const { data, error } = await this.client.rpc(
      "search_private_study_chunks",
      {
        p_document_types: request.documentTypes,
        p_limit: request.limit,
        p_query: request.query,
        p_subject: request.subject,
        p_topic_ids: request.topicIds ?? [],
      },
    );
    if (error) {
      throw new Error(`private lexical retrieval failed: ${error.message}`);
    }

    return ((data ?? []) as RpcChunkRow[]).map(toRankedSourceChunk);
  }

  async searchVector(
    request: RetrievalRequest,
    embedding: number[],
  ): Promise<RankedSourceChunk[]> {
    const { data, error } = await this.client.rpc(
      "search_private_study_chunks_vector",
      {
        p_document_types: request.documentTypes,
        p_embedding: embedding,
        p_limit: request.limit,
        p_subject: request.subject,
        p_topic_ids: request.topicIds ?? [],
      },
    );
    if (error) {
      throw new Error(`private vector retrieval failed: ${error.message}`);
    }

    return ((data ?? []) as RpcChunkRow[]).map(toRankedSourceChunk);
  }

  async searchPastPaperQuestions(
    request: PastPaperRetrievalRequest,
  ): Promise<RankedPastPaperQuestion[]> {
    const { data, error } = await this.client.rpc(
      "search_private_past_paper_questions",
      {
        p_limit: request.limit,
        p_paired_only: request.pairedOnly ?? false,
        p_paper: request.paper ?? null,
        p_query: request.query,
        p_subject: request.subject,
        p_topic_ids: request.topicIds ?? [],
        p_years: request.years ?? [],
      },
    );
    if (error) {
      throw new Error(
        `private past-paper retrieval failed: ${error.message}`,
      );
    }

    return ((data ?? []) as RpcPastPaperRow[]).map(
      toRankedPastPaperQuestion,
    );
  }

  async getPastPaperQuestion(
    questionId: string,
  ): Promise<RankedPastPaperQuestion | null> {
    const { data, error } = await this.client.rpc(
      "get_private_past_paper_question",
      {
        p_question_id: questionId,
      },
    );
    if (error) {
      throw new Error(
        `loading private past-paper question failed: ${error.message}`,
      );
    }

    const row = ((data ?? []) as RpcPastPaperRow[])[0];
    return row ? toRankedPastPaperQuestion(row) : null;
  }
}
