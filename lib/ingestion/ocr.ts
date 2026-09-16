import { assessExtractedPage } from "@/lib/ingestion/chunks";
import type {
  AssessedExtractedPage,
} from "@/lib/ingestion/types";

export type OcrPageReplacement = {
  pageNumber: number;
  text: string;
};

export function parseOcrReplacements(
  value: unknown,
): OcrPageReplacement[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "OCR results must be an object with a pages array",
    );
  }

  const pages = (
    value as { pages?: unknown }
  ).pages;
  if (!Array.isArray(pages)) {
    throw new Error(
      "OCR results must contain a pages array",
    );
  }

  const seen = new Set<number>();
  return pages.map((page, index) => {
    if (
      typeof page !== "object" ||
      page === null ||
      Array.isArray(page)
    ) {
      throw new Error(
        `OCR page at index ${index} must be an object`,
      );
    }

    const record = page as Record<string, unknown>;
    if (
      !Number.isSafeInteger(record.pageNumber) ||
      (record.pageNumber as number) < 1
    ) {
      throw new Error(
        "OCR page numbers must be positive one-based integers",
      );
    }
    if (
      typeof record.text !== "string" ||
      record.text.trim().length === 0
    ) {
      throw new Error(
        "OCR page text must be a non-empty string",
      );
    }

    const pageNumber = record.pageNumber as number;
    if (seen.has(pageNumber)) {
      throw new Error(
        `duplicate OCR page number: ${pageNumber}`,
      );
    }
    seen.add(pageNumber);

    return {
      pageNumber,
      text: record.text,
    };
  });
}

export function applyOcrReplacements(
  pages: AssessedExtractedPage[],
  replacements: OcrPageReplacement[],
): AssessedExtractedPage[] {
  const byPageNumber = new Map(
    pages.map((page) => [
      page.pageNumber,
      page,
    ]),
  );

  for (const replacement of replacements) {
    const existing = byPageNumber.get(
      replacement.pageNumber,
    );
    if (!existing) {
      throw new Error(
        `OCR page does not exist in extracted artifact: ${replacement.pageNumber}`,
      );
    }
    if (
      existing.extractionMethod !==
      "ocr_required"
    ) {
      throw new Error(
        `OCR replacement is only allowed for ocr_required pages: ${replacement.pageNumber}`,
      );
    }

    const assessed = assessExtractedPage({
      pageNumber: replacement.pageNumber,
      text: replacement.text,
    });
    if (
      assessed.extractionMethod !== "text"
    ) {
      throw new Error(
        `OCR text is still too weak to trust for page ${replacement.pageNumber}`,
      );
    }

    byPageNumber.set(
      replacement.pageNumber,
      {
        ...assessed,
        extractionMethod: "ocr",
      },
    );
  }

  return pages.map(
    (page) =>
      byPageNumber.get(page.pageNumber) ??
      page,
  );
}
