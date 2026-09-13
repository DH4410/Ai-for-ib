import "server-only";

import {
  createSelfHostedQueryEmbedder,
  isEmbeddingConfigured,
} from "@/lib/embeddings";
import { isStudyRepositoryConfigured } from "@/lib/database/supabase-server";
import { fuseRankings } from "@/lib/retrieval/ranking";
import {
  SupabaseStudySourceRepository,
  type RankedSourceChunk,
  type RetrievalRequest,
  type StudySourceRepository,
} from "@/lib/retrieval/repository";
import type { StudyDocumentType } from "@/lib/study-source/types";
import type { SourceChunk, Subject } from "@/types/study";

export type StudyRetrievalFilters = {
  documentTypes?: StudyDocumentType[];
  explanationLevel?: "simple" | "standard" | "full";
  hintsFirst?: boolean;
  paper?: string;
  realPastPapersOnly?: boolean;
  topicIds?: string[];
  years?: number[];
};

export type StudyRetrievalArgs = {
  subject: Subject;
  query: string;
  limit?: number;
  filters?: StudyRetrievalFilters;
};

type QueryEmbedder = (query: string) => Promise<number[]>;

type StudyRetrieverDependencies = {
  repository: StudySourceRepository;
  embedQuery?: QueryEmbedder;
};

const DEFAULT_DOCUMENT_TYPES: StudyDocumentType[] = ["textbook", "study-guide", "syllabus"];

function toSourceChunk(chunk: Awaited<ReturnType<StudySourceRepository["searchLexical"]>>[number]): SourceChunk {
  return {
    documentId: chunk.documentId,
    documentType: chunk.documentType,
    id: chunk.id,
    locator: chunk.locator,
    pageEnd: chunk.pageEnd,
    pageStart: chunk.pageStart,
    score: chunk.score,
    subject: chunk.subject,
    text: chunk.text,
    title: chunk.title,
    topicIds: chunk.topicIds,
  };
}

export function createStudyRetriever({ repository, embedQuery }: StudyRetrieverDependencies) {
  return async function retrieve(args: StudyRetrievalArgs): Promise<SourceChunk[]> {
    const limit = args.limit ?? 8;
    const request: RetrievalRequest = {
      documentTypes: args.filters?.documentTypes ?? DEFAULT_DOCUMENT_TYPES,
      limit: Math.min(Math.max(limit * 4, 10), 100),
      query: args.query,
      subject: args.subject,
      topicIds: args.filters?.topicIds,
    };
    const lexical = await repository.searchLexical(request);
    let vector: RankedSourceChunk[] = [];

    if (embedQuery) {
      try {
        vector = await repository.searchVector(request, await embedQuery(args.query));
      } catch {
        // A temporarily unavailable local embedding service must not prevent
        // a cited lexical answer when private retrieval is otherwise usable.
        vector = [];
      }
    }

    return fuseRankings({ lexical, limit, subject: args.subject, vector }).map(toSourceChunk);
  };
}

/**
 * Retrieval boundary for the private IB knowledge base.
 *
 * V1 deliberately returns no licensed material. The next milestone will replace
 * this with hybrid retrieval (metadata filters + embeddings/full-text search)
 * over privately stored textbooks, syllabus documents, notes, papers and
 * markschemes.
 */
export async function retrieveStudyContext(args: StudyRetrievalArgs): Promise<SourceChunk[]> {
  if (!isStudyRepositoryConfigured(process.env)) {
    return [];
  }

  const embedQuery = isEmbeddingConfigured(process.env)
    ? createSelfHostedQueryEmbedder()
    : undefined;
  const retrieve = createStudyRetriever({
    embedQuery,
    repository: new SupabaseStudySourceRepository(),
  });

  return retrieve(args);
}

export function formatRetrievedContext(chunks: SourceChunk[]): string {
  if (chunks.length === 0) {
    return "No private source passages were retrieved for this question.";
  }

  return chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}] ${chunk.title}${chunk.locator ? ` — ${chunk.locator}` : ""}\n${chunk.text}`,
    )
    .join("\n\n");
}
