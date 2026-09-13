import type {
  AssessedExtractedPage,
  ExtractedPageInput,
  IngestedContentChunk,
} from "@/lib/ingestion/types";
import type { Subject } from "@/types/study";

const MINIMUM_USABLE_CHARACTERS = 80;
const SECTION_HEADING_PATTERN = /^(?:(?:[A-E]|[1-5])\.\d+(?:\.\d+)?|(?:Structure|Reactivity)\s+\d+(?:\.\d+)?)\b/i;

type ChunkBuildContext = {
  documentId: string;
  subject: Subject;
  maxCharacters?: number;
};

type PendingChunk = {
  headingPath: string[];
  pageEnd: number;
  pageStart: number;
  parts: Array<{ pageNumber: number; text: string }>;
};

function textQuality(text: string): number {
  const nonWhitespaceCharacters = text.replace(/\s/g, "");
  if (nonWhitespaceCharacters.length === 0) {
    return 0;
  }

  const readableCharacters = nonWhitespaceCharacters.match(/[\p{L}\p{N}\p{P}\p{S}]/gu)?.length ?? 0;
  return readableCharacters / nonWhitespaceCharacters.length;
}

function findHeading(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .slice(0, 4)
    .map((line) => line.trim())
    .find((line) => line.length <= 160 && SECTION_HEADING_PATTERN.test(line));
}

function pageReferences(pageNumber: number, text: string, expression: RegExp): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => expression.test(line))
    .map((line) => `p. ${pageNumber}: ${line.slice(0, 160)}`);
}

function createChunk(
  pending: PendingChunk,
  context: ChunkBuildContext,
  index: number,
): IngestedContentChunk {
  const text = pending.parts.map(({ text: pageText }) => pageText).join("\n\n").trim();

  return {
    documentId: context.documentId,
    equationReferences: pending.parts.flatMap(({ pageNumber, text: pageText }) =>
      pageReferences(pageNumber, pageText, /(?:=|≈|→|←|⇌)/),
    ),
    figureReferences: pending.parts.flatMap(({ pageNumber, text: pageText }) =>
      pageReferences(pageNumber, pageText, /^(?:figure|fig\.)\s*\d+/i),
    ),
    headingPath: pending.headingPath,
    id: `${context.documentId}-p${pending.pageStart}-${index + 1}`,
    pageEnd: pending.pageEnd,
    pageStart: pending.pageStart,
    subject: context.subject,
    text,
    title: pending.headingPath.at(-1) ?? `Page ${pending.pageStart}`,
    topicConfidence: 0,
    topicIds: [],
  };
}

export function assessExtractedPage(page: ExtractedPageInput): AssessedExtractedPage {
  if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
    throw new Error("extracted page numbers must be positive one-based integers");
  }

  const quality = textQuality(page.text);
  const extractionMethod =
    page.text.trim().length >= MINIMUM_USABLE_CHARACTERS && quality >= 0.6
      ? "text"
      : "ocr_required";

  return { ...page, extractionMethod, textQuality: quality };
}

export function buildSemanticChunks(
  pages: ExtractedPageInput[],
  context: ChunkBuildContext,
): IngestedContentChunk[] {
  const maxCharacters = context.maxCharacters ?? 6000;
  const chunks: IngestedContentChunk[] = [];
  let pending: PendingChunk | undefined;

  function flushPendingChunk(): void {
    if (pending && pending.parts.some(({ text }) => text.trim().length > 0)) {
      chunks.push(createChunk(pending, context, chunks.length));
    }
    pending = undefined;
  }

  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      throw new Error("chunk page numbers must be positive one-based integers");
    }

    const normalizedText = page.text.trim();
    if (normalizedText.length === 0) {
      continue;
    }

    const heading = findHeading(normalizedText);
    if (heading && pending && pending.headingPath.at(-1) !== heading) {
      flushPendingChunk();
    }

    if (!pending) {
      pending = {
        headingPath: [heading ?? `Page ${page.pageNumber}`],
        pageEnd: page.pageNumber,
        pageStart: page.pageNumber,
        parts: [],
      };
    }

    const candidateLength =
      pending.parts.map(({ text }) => text).join("\n\n").length + normalizedText.length;
    if (pending.parts.length > 0 && candidateLength > maxCharacters) {
      const previousHeadingPath = pending.headingPath;
      flushPendingChunk();
      pending = {
        headingPath: heading ? [heading] : previousHeadingPath,
        pageEnd: page.pageNumber,
        pageStart: page.pageNumber,
        parts: [],
      };
    }

    pending.parts.push({ pageNumber: page.pageNumber, text: normalizedText });
    pending.pageEnd = page.pageNumber;
  }

  flushPendingChunk();
  return chunks;
}
