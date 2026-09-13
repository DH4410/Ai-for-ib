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

type ChatRouteDependencies = {
  generateTutorAnswer: typeof generateTutorAnswer;
  retrieveStudyContext: typeof retrieveStudyContext;
  loadLearnerContext?: (
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

      const [sources, learnerContext] = await Promise.all([
        dependencies.retrieveStudyContext({
          filters: parsedRequest.filters,
          limit: 8,
          mode: parsedRequest.mode,
          query: parsedRequest.message,
          subject: parsedRequest.subject,
        }),
        dependencies.loadLearnerContext?.(
          request,
          parsedRequest.subject,
        ) ?? Promise.resolve(undefined),
      ]);

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

async function loadProductionLearnerContext(
  request: Request,
  subject: Subject,
): Promise<string | undefined> {
  if (!request.headers.get("Authorization")) {
    return undefined;
  }

  if (
    !isUserAuthConfigured(process.env) ||
    !isStudyRepositoryConfigured(process.env)
  ) {
    return undefined;
  }

  const studentId = await resolveAuthenticatedUserId(request);
  const repository = new SupabaseLearningProgressRepository();
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
  loadLearnerContext: loadProductionLearnerContext,
  retrieveStudyContext,
});
