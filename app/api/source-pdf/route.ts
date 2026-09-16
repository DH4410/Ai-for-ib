import {
  readFile,
} from "node:fs/promises";
import {
  resolve,
} from "node:path";

import { NextResponse } from "next/server";

import {
  AuthenticationError,
  resolveAuthenticatedUserId,
} from "@/lib/auth/request-user";
import {
  resolvePrivateSourceAssetPath,
} from "@/lib/source-assets/local";
import {
  SupabaseSourceAssetRepository,
  type PastPaperAssetDescriptor,
  type SourceAssetRepository,
} from "@/lib/source-assets/repository";

export const runtime = "nodejs";

type SourcePdfRouteDependencies = {
  getRepository: () => SourceAssetRepository;
  resolveUserId: (
    request: Request,
  ) => Promise<string>;
  loadBytes: (
    asset: PastPaperAssetDescriptor,
  ) => Promise<Uint8Array>;
};

class SourcePdfValidationError extends Error {}

function questionIdFrom(
  request: Request,
): string {
  const value = new URL(
    request.url,
  ).searchParams
    .get("questionId")
    ?.trim();

  if (
    !value ||
    value.length > 256 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new SourcePdfValidationError(
      "questionId is required and must be a short source identifier",
    );
  }

  return value;
}

function errorResponse(
  error: unknown,
): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 },
    );
  }
  if (
    error instanceof SourcePdfValidationError
  ) {
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
          : "Private source PDF is unavailable.",
    },
    { status: 500 },
  );
}

export function createSourcePdfGetHandler(
  dependencies: SourcePdfRouteDependencies,
) {
  return async function GET(
    request: Request,
  ) {
    try {
      // Authenticate before checking whether a private
      // question/source exists.
      await dependencies.resolveUserId(
        request,
      );
      const questionId =
        questionIdFrom(request);
      const asset =
        await dependencies
          .getRepository()
          .getPastPaperAsset(questionId);

      if (!asset) {
        return NextResponse.json(
          {
            error:
              "Private source PDF was not found for this question.",
          },
          { status: 404 },
        );
      }

      if (
        asset.mimeType !==
        "application/pdf"
      ) {
        return NextResponse.json(
          {
            error:
              "This source asset is not a PDF.",
          },
          { status: 415 },
        );
      }

      const bytes =
        await dependencies.loadBytes(
          asset,
        );

      return new NextResponse(bytes, {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
          "Content-Disposition":
            'inline; filename="private-study-source.pdf"',
          "Content-Type":
            "application/pdf",
          "X-Content-Type-Options":
            "nosniff",
          "X-Source-Page-End":
            String(asset.pageEnd),
          "X-Source-Page-Start":
            String(asset.pageStart),
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const GET =
  createSourcePdfGetHandler({
    getRepository: () =>
      new SupabaseSourceAssetRepository(),
    loadBytes: async (asset) => {
      const path =
        resolvePrivateSourceAssetPath(
          resolve(
            process.cwd(),
            "private-sources",
          ),
          asset,
        );
      return new Uint8Array(
        await readFile(path),
      );
    },
    resolveUserId:
      resolveAuthenticatedUserId,
  });
