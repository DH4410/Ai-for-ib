import { NextResponse } from "next/server";

import {
  AuthenticationError,
  resolveAuthenticatedUserId,
} from "@/lib/auth/request-user";
import {
  SupabaseStudySourceCatalogRepository,
  type StudySourceCatalogRepository,
} from "@/lib/sources/repository";
import type { Subject } from "@/types/study";

export const runtime = "nodejs";

const SUBJECTS: Subject[] = [
  "physics",
  "chemistry",
  "mathematics",
];

class SourceCatalogValidationError extends Error {}

type SourceCatalogDependencies = {
  repository: StudySourceCatalogRepository;
  resolveUserId: (request: Request) => Promise<string>;
};

function parseSubject(value: string | null): Subject | undefined {
  if (value === null) {
    return undefined;
  }
  if (!SUBJECTS.includes(value as Subject)) {
    throw new SourceCatalogValidationError(
      "subject must be chemistry, physics, or mathematics",
    );
  }
  return value as Subject;
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 },
    );
  }
  if (error instanceof SourceCatalogValidationError) {
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
          : "Unexpected source-catalog error.",
    },
    { status: 500 },
  );
}

export function createSourceCatalogGetHandler(
  dependencies: SourceCatalogDependencies,
) {
  return async function GET(request: Request) {
    try {
      // Resolve the user before querying any private source metadata.
      await dependencies.resolveUserId(request);
      const subject = parseSubject(
        new URL(request.url).searchParams.get("subject"),
      );
      const sources =
        await dependencies.repository.listSources(subject);

      return NextResponse.json({ sources });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function GET(request: Request) {
  const handler = createSourceCatalogGetHandler({
    repository:
      new SupabaseStudySourceCatalogRepository(),
    resolveUserId: resolveAuthenticatedUserId,
  });

  return handler(request);
}
