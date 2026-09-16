import type { SourceCitation } from "@/types/study";

export type MarkSuggestion = {
  score: number;
  maximumMarks: number;
};

const MARK_FOOTER =
  /(?:^|\n)MARK:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/i;

export function parseMarkSuggestion(
  text: string,
): MarkSuggestion | null {
  const match = text.match(MARK_FOOTER);
  if (!match) {
    return null;
  }

  const score = Number(match[1]);
  const maximumMarks = Number(match[2]);

  if (
    !Number.isFinite(score) ||
    !Number.isFinite(maximumMarks) ||
    score < 0 ||
    maximumMarks <= 0 ||
    score > maximumMarks
  ) {
    return null;
  }

  return {
    maximumMarks,
    score,
  };
}

export function stripMarkSuggestion(
  text: string,
): string {
  return text.replace(MARK_FOOTER, "").trimEnd();
}


export function recordableMarkSuggestion(
  text: string,
  source: SourceCitation | undefined,
): MarkSuggestion | null {
  const suggestion = parseMarkSuggestion(text);
  if (!suggestion) {
    return null;
  }

  if (source?.documentType === "question-paper") {
    if (
      source.pairingStatus !== "paired" ||
      source.marks === undefined ||
      source.marks === null ||
      source.marks !== suggestion.maximumMarks
    ) {
      return null;
    }
  } else if (
    source?.marks !== undefined &&
    source.marks !== null &&
    source.marks !== suggestion.maximumMarks
  ) {
    return null;
  }

  return suggestion;
}
