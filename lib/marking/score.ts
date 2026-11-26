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
      !canRecordMarkResult(source) ||
      source.marks !== suggestion.maximumMarks
    ) {
      return null;
    }
  } else if (
    source?.marks === undefined ||
    source.marks === null ||
    source.marks !== suggestion.maximumMarks
  ) {
    return null;
  }

  return suggestion;
}

export function sanitizeMarkAnswer(
  text: string,
  source: SourceCitation | undefined,
): string {
  const suggestion = parseMarkSuggestion(text);
  if (!suggestion) {
    // Strip malformed/impossible numeric final footers too; they are not
    // evidence and should not be presented as a trusted score.
    return stripMarkSuggestion(text);
  }

  return recordableMarkSuggestion(text, source)
    ? text
    : stripMarkSuggestion(text);
}


export function canRecordMarkResult(
  source: SourceCitation | undefined,
): boolean {
  if (source?.documentType !== "question-paper") {
    return true;
  }

  return (
    source.pairingStatus === "paired" &&
    source.markschemeAvailable === true &&
    !source.visualContextRequired &&
    typeof source.marks === "number" &&
    Number.isFinite(source.marks) &&
    source.marks > 0
  );
}

/** Use the same source for server scoring and browser progress controls. */
export function selectMarkSource<T extends SourceCitation>(sources: readonly T[] | undefined): T | undefined {
  return sources?.find((source) => source.documentType === "question-paper") ??
    sources?.find((source) => (source.topicIds?.length ?? 0) > 0) ??
    sources?.[0];
}

/** An official paper must have a mapped topic before its result can be saved. */
export function canRecordMarkedProgress(source: SourceCitation | undefined): boolean {
  return canRecordMarkResult(source) &&
    (source?.documentType !== "question-paper" || (source.topicIds?.length ?? 0) > 0);
}
