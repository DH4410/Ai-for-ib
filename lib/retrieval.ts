import "server-only";

import {
  createSelfHostedQueryEmbedder,
  isEmbeddingConfigured,
} from "@/lib/embeddings";
import { isStudyRepositoryConfigured } from "@/lib/database/supabase-server";
import { fuseRankings } from "@/lib/retrieval/ranking";
import {
  SupabaseStudySourceRepository,
  type RankedPastPaperQuestion,
  type RankedSourceChunk,
  type RetrievalRequest,
  type StudySourceRepository,
} from "@/lib/retrieval/repository";
import type { StudyDocumentType } from "@/lib/study-source/types";
import type { SourceChunk, StudyMode, Subject } from "@/types/study";

export type StudyRetrievalFilters = {
  documentTypes?: StudyDocumentType[];
  explanationLevel?: "simple" | "standard" | "full";
  hintsFirst?: boolean;
  level?: "HL" | "SL";
  paper?: string;
  pastPaperQuestionId?: string;
  requireMarkscheme?: boolean;
  realPastPapersOnly?: boolean;
  session?: "may" | "november";
  timezone?: string;
  topicIds?: string[];
  years?: number[];
};

export type StudyRetrievalArgs = {
  subject: Subject;
  mode?: StudyMode;
  query: string;
  limit?: number;
  filters?: StudyRetrievalFilters;
};

type QueryEmbedder = (query: string) => Promise<number[]>;

type StudyRetrieverDependencies = {
  repository: StudySourceRepository;
  embedQuery?: QueryEmbedder;
};

const DEFAULT_DOCUMENT_TYPES: StudyDocumentType[] = [
  "textbook",
  "study-guide",
  "syllabus",
];

function toSourceChunk(
  chunk: Awaited<
    ReturnType<StudySourceRepository["searchLexical"]>
  >[number],
): SourceChunk {
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

function toPastPaperSourceChunk(
  question: RankedPastPaperQuestion,
  mode: StudyMode,
): SourceChunk {
  const includeMarkscheme =
    mode === "mark" &&
    question.pairingStatus === "paired" &&
    Boolean(question.markschemeText);

  return {
    documentId: question.documentId,
    documentType: "question-paper",
    id: question.id,
    locator: question.locator,
    marks: question.marks,
    level: question.level,
    pairingStatus: question.pairingStatus,
    paper: question.paper,
    questionNumber: question.questionNumber,
    score: question.score,
    subject: question.subject,
    text: includeMarkscheme
      ? `Question:\n${question.questionText}\n\nOfficial markscheme:\n${question.markschemeText}`
      : `Question:\n${question.questionText}`,
    title: question.title,
    session: question.session,
    timezone: question.timezone,
    topicIds: question.topicIds,
    year: question.year,
  };
}

function wantsPastPaperQuestions(
  filters: StudyRetrievalFilters | undefined,
): boolean {
  return Boolean(
    filters?.realPastPapersOnly ||
      filters?.documentTypes?.some(
        (documentType) =>
          documentType === "question-paper" ||
          documentType === "markscheme",
      ),
  );
}

export function createStudyRetriever({
  repository,
  embedQuery,
}: StudyRetrieverDependencies) {
  return async function retrieve(
    args: StudyRetrievalArgs,
  ): Promise<SourceChunk[]> {
    const limit = args.limit ?? 8;
    const mode = args.mode ?? "learn";

    if (args.filters?.pastPaperQuestionId) {
      const question =
        await repository.getPastPaperQuestion(
          args.filters.pastPaperQuestionId,
        );

      if (
        !question ||
        question.subject !== args.subject
      ) {
        return [];
      }

      return [toPastPaperSourceChunk(question, mode)];
    }

    if (wantsPastPaperQuestions(args.filters)) {
      const questions = await repository.searchPastPaperQuestions({
        limit,
        level: args.filters?.level,
        pairedOnly:
          mode === "mark" ||
          args.filters?.requireMarkscheme === true,
        paper: args.filters?.paper,
        query: args.query,
        session: args.filters?.session,
        subject: args.subject,
        timezone: args.filters?.timezone,
        topicIds: args.filters?.topicIds,
        years: args.filters?.years,
      });

      return questions.map((question) =>
        toPastPaperSourceChunk(question, mode),
      );
    }

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
        vector = await repository.searchVector(
          request,
          await embedQuery(args.query),
        );
      } catch {
        vector = [];
      }
    }

    return fuseRankings({
      lexical,
      limit,
      subject: args.subject,
      vector,
    }).map(toSourceChunk);
  };
}

export async function retrieveStudyContext(
  args: StudyRetrievalArgs,
): Promise<SourceChunk[]> {
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

export function formatRetrievedContext(
  chunks: SourceChunk[],
): string {
  if (chunks.length === 0) {
    return "No private source passages were retrieved for this question.";
  }

  return chunks
    .map((chunk, index) => {
      const metadata = [
        chunk.locator,
        chunk.marks !== undefined && chunk.marks !== null
          ? `${chunk.marks} marks`
          : undefined,
      ]
        .filter(Boolean)
        .join(" · ");

      return `[Source ${index + 1}] ${chunk.title}${metadata ? ` — ${metadata}` : ""}\n${chunk.text}`;
    })
    .join("\n\n");
}
