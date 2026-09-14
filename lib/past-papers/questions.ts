import type { ExtractedPageInput } from "@/lib/ingestion/types";

export type QuestionCandidate = {
  id: string;
  questionNumber: string;
  subquestion?: string;
  marks?: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  extractionStatus: "candidate" | "ambiguous";
};

type QuestionLevel = "top" | "letter" | "roman";

type QuestionMatch = {
  level: QuestionLevel;
  questionNumber: string;
  subquestion?: string;
  text: string;
  letterPart?: string;
  romanPart?: string;
};

type MatchState = {
  activeQuestionNumber?: string;
  activeLetterPart?: string;
  activeRomanPart?: string;
};

const ROMAN_PART = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const COMMAND_PREFIX =
  /^(?:calculate|compare|construct|deduce|define|derive|describe|determine|distinguish|draw|estimate|evaluate|explain|identify|justify|outline|predict|show|sketch|state|suggest)\b/i;

function extractVisibleMarks(
  text: string,
): number | undefined {
  const bracketedMarks =
    text.match(/\[(\d+)\]\s*$/)?.[1];
  const writtenMarks =
    text.match(/\((\d+)\s+marks?\)\s*$/i)?.[1];
  const value = bracketedMarks ?? writtenMarks;

  return value ? Number(value) : undefined;
}

function nextLetter(value: string | undefined): string | undefined {
  if (!value || !/^[a-z]$/.test(value)) {
    return undefined;
  }

  return String.fromCharCode(value.charCodeAt(0) + 1);
}

function parenthesizedPartLevel(
  token: string,
  state: MatchState,
): "letter" | "roman" | undefined {
  const normalized = token.toLocaleLowerCase();

  if (
    state.activeLetterPart &&
    ROMAN_PART.test(normalized) &&
    (
      state.activeRomanPart !== undefined ||
      normalized.length > 1 ||
      (normalized === "i" &&
        nextLetter(state.activeLetterPart) !== "i")
    )
  ) {
    return "roman";
  }

  return /^[a-z]$/.test(normalized)
    ? "letter"
    : undefined;
}

function matchQuestion(
  line: string,
  state: MatchState,
): QuestionMatch | undefined {
  const numberedRoman = line.match(
    /^(\d+)\s+\(?([a-z])\)?[.)]?\s+\(?((?:i|ii|iii|iv|v|vi|vii|viii|ix|x))\)?[.)]?\s+(.*)$/i,
  );
  if (numberedRoman) {
    const letterPart =
      numberedRoman[2].toLocaleLowerCase();
    const romanPart =
      numberedRoman[3].toLocaleLowerCase();
    return {
      letterPart,
      level: "roman",
      questionNumber: numberedRoman[1],
      romanPart,
      subquestion: `${letterPart}.${romanPart}`,
      text: numberedRoman[4],
    };
  }

  const numberedLetter = line.match(
    /^(\d+)\s+\(?([a-z])\)?[.)]?\s+(.*)$/i,
  );
  if (numberedLetter) {
    const letterPart =
      numberedLetter[2].toLocaleLowerCase();
    return {
      letterPart,
      level: "letter",
      questionNumber: numberedLetter[1],
      subquestion: letterPart,
      text: numberedLetter[3],
    };
  }

  const combined = line.match(
    /^(\d+)[.)]\s*\(([a-z])\)\s*(.*)$/i,
  );
  if (combined) {
    const letterPart = combined[2].toLocaleLowerCase();
    return {
      letterPart,
      level: "letter",
      questionNumber: combined[1],
      subquestion: letterPart,
      text: combined[3],
    };
  }

  const topLevel = line.match(/^(\d+)[.)]\s*(.*)$/);
  if (topLevel) {
    return {
      level: "top",
      questionNumber: topLevel[1],
      text: topLevel[2],
    };
  }

  const parenthesized = line.match(
    /^\(([a-z]+)\)\s*(.*)$/i,
  );
  if (parenthesized && state.activeQuestionNumber) {
    const token =
      parenthesized[1].toLocaleLowerCase();
    const level = parenthesizedPartLevel(
      token,
      state,
    );

    if (level === "roman" && state.activeLetterPart) {
      return {
        letterPart: state.activeLetterPart,
        level,
        questionNumber: state.activeQuestionNumber,
        romanPart: token,
        subquestion: `${state.activeLetterPart}.${token}`,
        text: parenthesized[2],
      };
    }

    if (level === "letter") {
      return {
        letterPart: token,
        level,
        questionNumber: state.activeQuestionNumber,
        subquestion: token,
        text: parenthesized[2],
      };
    }
  }

  const dottedLetter = line.match(
    /^([a-z])[.)]\s*(.*)$/i,
  );
  if (dottedLetter && state.activeQuestionNumber) {
    const letterPart =
      dottedLetter[1].toLocaleLowerCase();
    return {
      letterPart,
      level: "letter",
      questionNumber: state.activeQuestionNumber,
      subquestion: letterPart,
      text: dottedLetter[2],
    };
  }

  return undefined;
}

function candidateId(
  documentId: string,
  questionNumber: string,
  subquestion?: string,
): string {
  return `${documentId}-q${questionNumber}${subquestion ?? ""}`;
}

function inheritedContext(
  candidate: QuestionCandidate | undefined,
): string | undefined {
  const text = candidate?.text.trim();

  if (!text || COMMAND_PREFIX.test(text)) {
    return undefined;
  }

  return text;
}

function withContext(
  context: string | undefined,
  text: string,
): string {
  const cleanContext = context?.trim();
  const cleanText = text.trim();

  if (!cleanContext) {
    return cleanText;
  }
  if (!cleanText) {
    return cleanContext;
  }

  return `${cleanContext}\n${cleanText}`;
}

export function extractQuestionCandidates(
  pages: ExtractedPageInput[],
  documentId: string,
  options: {
    inheritParentContext?: boolean;
  } = {},
): QuestionCandidate[] {
  const inheritParentContext =
    options.inheritParentContext ?? true;
  const candidates: QuestionCandidate[] = [];
  const candidateIds = new Set<string>();
  let activeQuestionNumber: string | undefined;
  let activeLetterPart: string | undefined;
  let activeRomanPart: string | undefined;
  let activeCandidate: QuestionCandidate | undefined;
  let activeTopCandidate: QuestionCandidate | undefined;
  let activeLetterCandidate: QuestionCandidate | undefined;

  for (const page of pages) {
    if (
      !Number.isInteger(page.pageNumber) ||
      page.pageNumber < 1
    ) {
      throw new Error(
        "question candidate pages must have positive one-based page numbers",
      );
    }

    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      const match = matchQuestion(line, {
        activeLetterPart,
        activeQuestionNumber,
        activeRomanPart,
      });
      if (!match) {
        if (activeCandidate) {
          activeCandidate.text =
            `${activeCandidate.text}\n${line}`;
          activeCandidate.pageEnd = page.pageNumber;
        }
        continue;
      }

      activeQuestionNumber = match.questionNumber;

      let contextualText = match.text;
      if (match.level === "top") {
        activeLetterPart = undefined;
        activeRomanPart = undefined;
        activeLetterCandidate = undefined;
      } else if (match.level === "letter") {
        if (
          inheritParentContext &&
          activeTopCandidate?.questionNumber ===
            match.questionNumber
        ) {
          contextualText = withContext(
            inheritedContext(activeTopCandidate),
            match.text,
          );
        }
        activeLetterPart = match.letterPart;
        activeRomanPart = undefined;
      } else if (match.level === "roman") {
        if (match.letterPart) {
          activeLetterPart = match.letterPart;
        }
        if (
          inheritParentContext &&
          activeLetterCandidate?.questionNumber ===
            match.questionNumber &&
          activeLetterCandidate.subquestion ===
            match.letterPart
        ) {
          contextualText = withContext(
            inheritedContext(activeLetterCandidate),
            match.text,
          );
        } else if (
          inheritParentContext &&
          activeTopCandidate?.questionNumber ===
            match.questionNumber
        ) {
          contextualText = withContext(
            inheritedContext(activeTopCandidate),
            match.text,
          );
        }
        activeRomanPart = match.romanPart;
      }

      const id = candidateId(
        documentId,
        match.questionNumber,
        match.subquestion,
      );
      const candidate: QuestionCandidate = {
        extractionStatus: candidateIds.has(id)
          ? "ambiguous"
          : "candidate",
        id,
        marks: extractVisibleMarks(line),
        pageEnd: page.pageNumber,
        pageStart: page.pageNumber,
        questionNumber: match.questionNumber,
        subquestion: match.subquestion,
        text: contextualText,
      };
      candidates.push(candidate);
      candidateIds.add(id);
      activeCandidate = candidate;

      if (match.level === "top") {
        activeTopCandidate = candidate;
      } else if (match.level === "letter") {
        activeLetterCandidate = candidate;
      }
    }
  }

  return candidates;
}
