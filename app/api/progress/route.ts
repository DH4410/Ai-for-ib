import { NextResponse } from "next/server";

import {
  AuthenticationError,
  resolveAuthenticatedUserId,
} from "@/lib/auth/request-user";
import {
  SupabaseLearningProgressRepository,
  type LearningEventInput,
  type LearningProgressRepository,
} from "@/lib/learning/repository";
import { updateTopicMastery } from "@/lib/learning/mastery";
import type { Subject } from "@/types/study";

export const runtime = "nodejs";

const SUBJECTS: Subject[] = [
  "physics",
  "chemistry",
  "mathematics",
];

type ProgressRouteDependencies = {
  repository: LearningProgressRepository;
  resolveUserId: (request: Request) => Promise<string>;
  now: () => string;
};

class ProgressValidationError extends Error {}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseSubject(value: unknown): Subject {
  if (
    typeof value !== "string" ||
    !SUBJECTS.includes(value as Subject)
  ) {
    throw new ProgressValidationError(
      "subject must be chemistry, physics, or mathematics",
    );
  }

  return value as Subject;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new ProgressValidationError(
      `${field} must be between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function parseAttempt(
  value: unknown,
  occurredAt: string,
): LearningEventInput {
  if (!isRecord(value)) {
    throw new ProgressValidationError(
      "request body must be an object",
    );
  }

  const subject = parseSubject(value.subject);
  if (
    typeof value.topicId !== "string" ||
    !value.topicId.trim()
  ) {
    throw new ProgressValidationError(
      "topicId must be a non-empty string",
    );
  }

  const score = optionalNumber(
    value.score,
    "score",
    0,
    1000,
  );
  const maximumMarks = optionalNumber(
    value.maximumMarks,
    "maximumMarks",
    0.000001,
    1000,
  );
  if (score === undefined || maximumMarks === undefined) {
    throw new ProgressValidationError(
      "score and maximumMarks are required",
    );
  }
  if (score > maximumMarks) {
    throw new ProgressValidationError(
      "score cannot exceed maximumMarks",
    );
  }

  const hintsUsed =
    value.hintsUsed === undefined ? 0 : value.hintsUsed;
  if (
    !Number.isSafeInteger(hintsUsed) ||
    (hintsUsed as number) < 0 ||
    (hintsUsed as number) > 100
  ) {
    throw new ProgressValidationError(
      "hintsUsed must be an integer from 0 to 100",
    );
  }

  const confidence = optionalNumber(
    value.confidence,
    "confidence",
    0,
    1,
  );
  const misconceptionTags =
    value.misconceptionTags === undefined
      ? []
      : value.misconceptionTags;
  if (
    !Array.isArray(misconceptionTags) ||
    misconceptionTags.length > 12 ||
    misconceptionTags.some(
      (tag) =>
        typeof tag !== "string" ||
        !tag.trim() ||
        tag.length > 80,
    )
  ) {
    throw new ProgressValidationError(
      "misconceptionTags must contain at most 12 short strings",
    );
  }

  const pastPaperQuestionId =
    value.pastPaperQuestionId === undefined ||
    value.pastPaperQuestionId === null
      ? null
      : value.pastPaperQuestionId;
  if (
    pastPaperQuestionId !== null &&
    (typeof pastPaperQuestionId !== "string" ||
      !pastPaperQuestionId.trim())
  ) {
    throw new ProgressValidationError(
      "pastPaperQuestionId must be a non-empty string when provided",
    );
  }

  return {
    confidence,
    hintsUsed: hintsUsed as number,
    maximumMarks,
    misconceptionTags: misconceptionTags.map((tag) =>
      (tag as string).trim(),
    ),
    occurredAt,
    pastPaperQuestionId,
    score,
    subject,
    topicId: value.topicId.trim(),
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 },
    );
  }
  if (error instanceof ProgressValidationError) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Unexpected learning-progress error.",
    },
    { status: 500 },
  );
}

export function createProgressHandlers(
  dependencies: ProgressRouteDependencies,
) {
  return {
    GET: async (request: Request) => {
      try {
        const studentId =
          await dependencies.resolveUserId(request);
        const requestedSubject = new URL(
          request.url,
        ).searchParams.get("subject");
        const subject = requestedSubject
          ? parseSubject(requestedSubject)
          : undefined;
        const progress =
          await dependencies.repository.listTopicMastery(
            studentId,
            subject,
          );

        return NextResponse.json({ progress });
      } catch (error) {
        return errorResponse(error);
      }
    },

    POST: async (request: Request) => {
      try {
        const studentId =
          await dependencies.resolveUserId(request);
        const body: unknown = await request.json();
        const attempt = parseAttempt(
          body,
          dependencies.now(),
        );
        const existing =
          await dependencies.repository.listTopicMastery(
            studentId,
            attempt.subject,
          );
        const previous =
          existing.find(
            ({ topicId }) =>
              topicId === attempt.topicId,
          ) ?? null;
        const mastery = updateTopicMastery(
          previous,
          attempt,
        );

        await dependencies.repository.recordAttempt(
          studentId,
          {
            ...attempt,
            attemptNumber: mastery.attemptCount,
          },
          mastery,
        );

        return NextResponse.json({ mastery });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

const handlers = createProgressHandlers({
  now: () => new Date().toISOString(),
  repository: new SupabaseLearningProgressRepository(),
  resolveUserId: resolveAuthenticatedUserId,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
