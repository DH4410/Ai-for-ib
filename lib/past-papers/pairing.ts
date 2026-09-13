import type { PastPaperDocument } from "@/lib/past-papers/metadata";

export type PaperPairing =
  | {
      pairingStatus: "paired";
      questionDocumentId: string;
      markschemeDocumentId: string;
    }
  | {
      pairingStatus: "question_only";
      questionDocumentId: string;
    }
  | {
      pairingStatus: "ambiguous";
      questionDocumentId: string;
      candidateMarkschemeDocumentIds: string[];
    };

function pairingKey(document: PastPaperDocument): string {
  return [
    document.subject,
    document.syllabusVersion,
    document.level,
    document.year,
    document.session,
    document.timezone.toLocaleUpperCase(),
    document.paper.toLocaleLowerCase(),
    document.language.toLocaleLowerCase(),
  ].join("|");
}

export function pairPapersAndMarkschemes(
  questionPapers: PastPaperDocument[],
  markschemes: PastPaperDocument[],
): PaperPairing[] {
  const markschemesByKey = new Map<string, PastPaperDocument[]>();

  for (const markscheme of markschemes) {
    if (markscheme.documentKind !== "markscheme") {
      continue;
    }

    const key = pairingKey(markscheme);
    const candidates = markschemesByKey.get(key) ?? [];
    candidates.push(markscheme);
    markschemesByKey.set(key, candidates);
  }

  return questionPapers
    .filter(({ documentKind }) => documentKind === "question-paper")
    .map((questionPaper): PaperPairing => {
      const candidates = markschemesByKey.get(pairingKey(questionPaper)) ?? [];

      if (candidates.length === 0) {
        return {
          pairingStatus: "question_only",
          questionDocumentId: questionPaper.id,
        };
      }

      if (candidates.length === 1) {
        return {
          markschemeDocumentId: candidates[0].id,
          pairingStatus: "paired",
          questionDocumentId: questionPaper.id,
        };
      }

      return {
        candidateMarkschemeDocumentIds: candidates.map(({ id }) => id),
        pairingStatus: "ambiguous",
        questionDocumentId: questionPaper.id,
      };
    });
}
