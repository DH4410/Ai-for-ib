import { NextResponse } from "next/server";

import {
  AuthenticationError,
  isUserAuthConfigured,
  resolveAuthenticatedUserId,
} from "@/lib/auth/request-user";
import {
  ChatRequestValidationError,
  parseChatRequest,
} from "@/lib/api/chat-request";
import {
  isStudyRepositoryConfigured,
} from "@/lib/database/supabase-server";
import { formatLearnerContext } from "@/lib/learning/context";
import {
  SupabaseLearningProgressRepository,
} from "@/lib/learning/repository";
import { generateTutorAnswer } from "@/lib/model";
import { buildSystemPrompt } from "@/lib/prompt";
import {
  formatRetrievedContext,
  retrieveStudyContext,
} from "@/lib/retrieval";
import type {
  SourceChunk,
  Subject,
  TutorResponse,
} from "@/types/study";

export const runtime = "nodejs";

export class PrivateRetrievalConfigurationError extends Error {}

type ChatRouteDependencies = {
  generateTutorAnswer: typeof generateTutorAnswer;
  retrieveStudyContext: typeof retrieveStudyContext;
  prepareLearnerContext?: (
    request: Request,
    subject: Subject,
  ) => Promise<string | undefined>;
};

function toSourceCitation(
  source: SourceChunk,
): TutorResponse["sources"][number] {
  return {
    documentType: source.documentType,
    id: source.id,
    locator: source.locator,
    marks: source.marks,
    pageEnd: source.pageEnd,
    pageStart: source.pageStart,
    pairingStatus: source.pairingStatus,
    paper: source.paper,
    questionNumber: source.questionNumber,
    title: source.title,
    topicIds: source.topicIds,
    year: source.year,
  };
}

export function createChatPostHandler(
  dependencies: ChatRouteDependencies,
) {
  return async function POST(request: Request) {
    try {
      const body: unknown = await request.json();
      const parsedRequest = parseChatRequest(body);

      // Authentication/personalization must complete before any private
      // retrieval starts. This prevents an anonymous request from probing a
      // connected licensed source repository.
      const learnerContext =
        await dependencies.prepareLearnerContext?.(
          request,
          parsedRequest.subject,
        );

      const sources =
        await dependencies.retrieveStudyContext({
          filters: parsedRequest.filters,
          limit: 8,
          mode: parsedRequest.mode,
          query: parsedRequest.message,
          subject: parsedRequest.subject,
        });

      if (
        parsedRequest.filters?.realPastPapersOnly === true &&
        sources.length === 0
      ) {
        const response: TutorResponse = {
          answer:
            "I don't have a matching indexed real past-paper question for those filters yet. I won't invent one and label it as an IB past-paper question. Try a different year/paper filter, or add the relevant authorized paper to the private index.",
          model: "retrieval-only",
          sources: [],
        };

        return NextResponse.json(response);
      }

      const system = buildSystemPrompt({
        explanationLevel:
          parsedRequest.filters?.explanationLevel,
        hintsFirst: parsedRequest.filters?.hintsFirst,
        learnerContext,
        mode: parsedRequest.mode,
        realPastPapersOnly:
          parsedRequest.filters?.realPastPapersOnly === true,
        retrievedContext: formatRetrievedContext(sources),
        subject: parsedRequest.subject,
      });

      const result = await dependencies.generateTutorAnswer({
        system,
        messages: [
          ...parsedRequest.history,
          { role: "user", content: parsedRequest.message },
        ],
      });

      const response: TutorResponse = {
        answer: result.text,
        model: result.model,
        sources: sources.map(toSourceCitation),
      };

      return NextResponse.json(response);
    } catch (error) {
      if (error instanceof ChatRequestValidationError) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }
      if (error instanceof AuthenticationError) {
        return NextResponse.json(
          { error: error.message },
          { status: 401 },
        );
      }
      if (
        error instanceof PrivateRetrievalConfigurationError
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: 503 },
        );
      }

      console.error(error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unexpected error while generating the tutor response.",
        },
        { status: 500 },
      );
    }
  };
}

async function prepareProductionLearnerContext(
  request: Request,
  subject: Subject,
): Promise<string | undefined> {
  if (!isStudyRepositoryConfigured(process.env)) {
    return undefined;
  }

  if (!isUserAuthConfigured(process.env)) {
    throw new PrivateRetrievalConfigurationError(
      "Private study sources are configured without user authentication. Configure Supabase Auth before enabling private retrieval.",
    );
  }

  const studentId = await resolveAuthenticatedUserId(request);
  const repository =
    new SupabaseLearningProgressRepository();
  const progress = await repository.listTopicMastery(
    studentId,
    subject,
  );

  return formatLearnerContext(
    progress,
    new Date().toISOString(),
  );
}

export const POST = createChatPostHandler({
  generateTutorAnswer,
  prepareLearnerContext:
    prepareProductionLearnerContext,
  retrieveStudyContext,
});
