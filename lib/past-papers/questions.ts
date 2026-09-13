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

type QuestionMatch = {
  questionNumber: string;
  subquestion?: string;
  text: string;
};

function extractVisibleMarks(text: string): number | undefined {
  const bracketedMarks = text.match(/\[(\d+)\]\s*$/)?.[1];
  const writtenMarks = text.match(/\((\d+)\s+marks?\)\s*$/i)?.[1];
  const value = bracketedMarks ?? writtenMarks;

  return value ? Number(value) : undefined;
}

function matchQuestion(line: string, activeQuestionNumber?: string): QuestionMatch | undefined {
  const topLevel = line.match(/^(\d+)[.)]\s*(.*)$/);
  if (topLevel) {
    return { questionNumber: topLevel[1], text: topLevel[2] };
  }

  const subquestion = line.match(/^\(?([a-z])\)?[.)]\s*(.*)$/i);
  if (subquestion && activeQuestionNumber) {
    return {
      questionNumber: activeQuestionNumber,
      subquestion: subquestion[1].toLowerCase(),
      text: subquestion[2],
    };
  }

  return undefined;
}

function candidateId(documentId: string, questionNumber: string, subquestion?: string): string {
  return `${documentId}-q${questionNumber}${subquestion ?? ""}`;
}

export function extractQuestionCandidates(
  pages: ExtractedPageInput[],
  documentId: string,
): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];
  const candidateIds = new Set<string>();
  let activeQuestionNumber: string | undefined;
  let activeCandidate: QuestionCandidate | undefined;

  for (const page of pages) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      throw new Error("question candidate pages must have positive one-based page numbers");
    }

    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }

      const match = matchQuestion(line, activeQuestionNumber);
      if (!match) {
        if (activeCandidate) {
          activeCandidate.text = `${activeCandidate.text}\n${line}`;
          activeCandidate.pageEnd = page.pageNumber;
        }
        continue;
      }

      activeQuestionNumber = match.questionNumber;
      const id = candidateId(documentId, match.questionNumber, match.subquestion);
      const candidate: QuestionCandidate = {
        extractionStatus: candidateIds.has(id) ? "ambiguous" : "candidate",
        id,
        marks: extractVisibleMarks(line),
        pageEnd: page.pageNumber,
        pageStart: page.pageNumber,
        questionNumber: match.questionNumber,
        subquestion: match.subquestion,
        text: match.text,
      };
      candidates.push(candidate);
      candidateIds.add(id);
      activeCandidate = candidate;
    }
  }

  return candidates;
}
