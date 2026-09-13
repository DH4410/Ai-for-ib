import type { ExtractedPageInput } from "@/lib/ingestion/types";
import type { PastPaperDocument } from "@/lib/past-papers/metadata";
import {
  extractQuestionCandidates,
  type QuestionCandidate,
} from "@/lib/past-papers/questions";
import { pairPapersAndMarkschemes } from "@/lib/past-papers/pairing";
import {
  classifyTopics,
  type TopicClassificationMethod,
} from "@/lib/taxonomy/classify";

export type StructuredPastPaperQuestion = {
  id: string;
  subject: PastPaperDocument["subject"];
  syllabusVersion: string;
  level: PastPaperDocument["level"];
  year: number;
  session: PastPaperDocument["session"];
  timezone: string;
  paper: string;
  questionNumber: string;
  subquestion?: string;
  marks?: number;
  commandTerms: string[];
  questionText: string;
  markschemeText: string | null;
  pairingStatus: "paired" | "question_only";
  topicIds: string[];
  topicConfidence: number;
  topicClassificationMethod: TopicClassificationMethod;
};

export type PastPaperBuildResult = {
  questions: StructuredPastPaperQuestion[];
  skippedAmbiguousQuestionIds: string[];
  unmatchedMarkschemeCandidateIds: string[];
};

const COMMAND_TERMS = [
  "calculate",
  "compare",
  "construct",
  "deduce",
  "define",
  "derive",
  "describe",
  "determine",
  "distinguish",
  "draw",
  "estimate",
  "evaluate",
  "explain",
  "identify",
  "justify",
  "outline",
  "predict",
  "show",
  "sketch",
  "state",
  "suggest",
] as const;

function candidateKey(candidate: QuestionCandidate): string {
  return `${candidate.questionNumber}:${candidate.subquestion ?? ""}`;
}

function commandTerms(text: string): string[] {
  const normalized = text.trim().toLocaleLowerCase();

  return COMMAND_TERMS.filter(
    (term) =>
      normalized === term ||
      normalized.startsWith(`${term} `) ||
      normalized.startsWith(`${term}\n`),
  );
}

function assertMatchingPaperMetadata(
  question: PastPaperDocument,
  markscheme: PastPaperDocument | undefined,
): void {
  if (!markscheme) {
    return;
  }

  const [pairing] = pairPapersAndMarkschemes(
    [question],
    [markscheme],
  );

  if (!pairing || pairing.pairingStatus !== "paired") {
    throw new Error(
      "markscheme metadata does not uniquely match the question paper",
    );
  }
}

export function buildPastPaperQuestionRecords(args: {
  questionDocument: PastPaperDocument;
  questionPages: ExtractedPageInput[];
  markschemeDocument?: PastPaperDocument;
  markschemePages?: ExtractedPageInput[];
}): PastPaperBuildResult {
  if (args.questionDocument.documentKind !== "question-paper") {
    throw new Error("questionDocument must be a question paper");
  }
  if (
    args.markschemeDocument &&
    args.markschemeDocument.documentKind !== "markscheme"
  ) {
    throw new Error("markschemeDocument must be a markscheme");
  }
  if (Boolean(args.markschemeDocument) !== Boolean(args.markschemePages)) {
    throw new Error(
      "markscheme metadata and pages must be provided together",
    );
  }

  assertMatchingPaperMetadata(
    args.questionDocument,
    args.markschemeDocument,
  );

  const questionCandidates = extractQuestionCandidates(
    args.questionPages,
    args.questionDocument.id,
  );
  const markschemeCandidates = args.markschemePages
    ? extractQuestionCandidates(
        args.markschemePages,
        args.markschemeDocument!.id,
      )
    : [];

  const schemesByKey = new Map<string, QuestionCandidate[]>();
  for (const candidate of markschemeCandidates) {
    const key = candidateKey(candidate);
    const matches = schemesByKey.get(key) ?? [];
    matches.push(candidate);
    schemesByKey.set(key, matches);
  }

  const skippedAmbiguousQuestionIds: string[] = [];
  const matchedSchemeIds = new Set<string>();
  const questions: StructuredPastPaperQuestion[] = [];

  for (const candidate of questionCandidates) {
    if (candidate.extractionStatus === "ambiguous") {
      skippedAmbiguousQuestionIds.push(candidate.id);
      continue;
    }

    const schemeMatches = schemesByKey
      .get(candidateKey(candidate))
      ?.filter(
        ({ extractionStatus }) =>
          extractionStatus === "candidate",
      ) ?? [];

    if (schemeMatches.length > 1) {
      skippedAmbiguousQuestionIds.push(candidate.id);
      continue;
    }

    const markschemeCandidate = schemeMatches[0];
    if (markschemeCandidate) {
      matchedSchemeIds.add(markschemeCandidate.id);
    }

    const classification = classifyTopics({
      subject: args.questionDocument.subject,
      text: candidate.text,
      title: candidate.text.split(/\r?\n/, 1)[0] ?? "",
    });

    questions.push({
      commandTerms: commandTerms(candidate.text),
      id: candidate.id,
      level: args.questionDocument.level,
      marks: candidate.marks ?? markschemeCandidate?.marks,
      markschemeText: markschemeCandidate?.text ?? null,
      pairingStatus: markschemeCandidate
        ? "paired"
        : "question_only",
      paper: args.questionDocument.paper,
      questionNumber: candidate.questionNumber,
      questionText: candidate.text,
      session: args.questionDocument.session,
      subject: args.questionDocument.subject,
      subquestion: candidate.subquestion,
      syllabusVersion: args.questionDocument.syllabusVersion,
      timezone: args.questionDocument.timezone,
      topicClassificationMethod: classification.method,
      topicConfidence: classification.confidence,
      topicIds: classification.topicIds,
      year: args.questionDocument.year,
    });
  }

  return {
    questions,
    skippedAmbiguousQuestionIds,
    unmatchedMarkschemeCandidateIds: markschemeCandidates
      .filter(({ id }) => !matchedSchemeIds.has(id))
      .map(({ id }) => id),
  };
}
