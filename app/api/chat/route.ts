import { NextResponse } from "next/server";

import { ChatRequestValidationError, parseChatRequest } from "@/lib/api/chat-request";
import { generateTutorAnswer } from "@/lib/model";
import { buildSystemPrompt } from "@/lib/prompt";
import { formatRetrievedContext, retrieveStudyContext } from "@/lib/retrieval";
import type { SourceChunk, TutorResponse } from "@/types/study";

export const runtime = "nodejs";

type ChatRouteDependencies = {
  generateTutorAnswer: typeof generateTutorAnswer;
  retrieveStudyContext: typeof retrieveStudyContext;
};

function toSourceCitation(source: SourceChunk): TutorResponse["sources"][number] {
  return {
    documentType: source.documentType,
    id: source.id,
    locator: source.locator,
    pageEnd: source.pageEnd,
    pageStart: source.pageStart,
    title: source.title,
    topicIds: source.topicIds,
  };
}

export function createChatPostHandler(dependencies: ChatRouteDependencies) {
  return async function POST(request: Request) {
    try {
      const body: unknown = await request.json();
      const parsedRequest = parseChatRequest(body);

      const sources = await dependencies.retrieveStudyContext({
        filters: parsedRequest.filters,
        limit: 8,
        query: parsedRequest.message,
        subject: parsedRequest.subject,
      });

      const system = buildSystemPrompt({
        subject: parsedRequest.subject,
        mode: parsedRequest.mode,
        retrievedContext: formatRetrievedContext(sources),
      });

      const result = await dependencies.generateTutorAnswer({
        system,
        messages: [...parsedRequest.history, { role: "user", content: parsedRequest.message }],
      });

      const response: TutorResponse = {
        answer: result.text,
        model: result.model,
        sources: sources.map(toSourceCitation),
      };

      return NextResponse.json(response);
    } catch (error) {
      if (error instanceof ChatRequestValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
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

export const POST = createChatPostHandler({ generateTutorAnswer, retrieveStudyContext });
