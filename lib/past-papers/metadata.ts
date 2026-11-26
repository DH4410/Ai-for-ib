import type { Subject } from "@/types/study";

export type PaperDocumentKind = "question-paper" | "markscheme" | "data-booklet" | "other";
export type PaperLevel = "HL" | "SL";
export type PaperSession = "may" | "november";

export type ParsedPaperMetadata = {
  subject?: Subject;
  year?: number;
  session?: PaperSession;
  timezone?: string;
  level?: PaperLevel;
  paper?: string;
  documentKind?: PaperDocumentKind;
};

export type PastPaperDocument = {
  id: string;
  subject: Subject;
  syllabusVersion: string;
  level: PaperLevel;
  year: number;
  session: PaperSession;
  timezone: string;
  paper: string;
  language: string;
  documentKind: Extract<PaperDocumentKind, "question-paper" | "markscheme">;
};

function normalizedFilename(filename: string): string {
  return filename
    .toLocaleLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function only<T>(values: T[]): T | undefined {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

function parseSubject(filename: string): Subject | undefined {
  const subjects: Subject[] = [];
  if (/\bchem(?:istry)?\b/.test(filename)) subjects.push("chemistry");
  if (/\bphysics\b/.test(filename)) subjects.push("physics");
  if (/\bmath(?:ematics)?\b/.test(filename)) subjects.push("mathematics");
  return only(subjects);
}

function parseSessionAndYear(filename: string): Pick<ParsedPaperMetadata, "session" | "year"> {
  const sessions: PaperSession[] = [];
  const years = [...filename.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  for (const match of filename.matchAll(/\b([mn])(20\d{2}|\d{2})\b/g)) {
    sessions.push(match[1] === "m" ? "may" : "november");
    years.push(match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]));
  }
  if (/\bnov(?:ember)?\b/.test(filename)) sessions.push("november");
  if (/\bmay\b/.test(filename)) sessions.push("may");
  return { session: only(sessions), year: only(years) };
}

function parsePaper(filename: string): string | undefined {
  // A standalone number can be a date, copy number, or part of a filename.
  const matches = [...filename.matchAll(/\b(?:paper\s*|p)(1a|1b|[123])\b/g)];
  return only(matches.map((match) => "p" + match[1]));
}

export function parsePaperMetadata(filename: string): ParsedPaperMetadata {
  const normalized = normalizedFilename(filename);
  const { session, year } = parseSessionAndYear(normalized);
  const kinds: PaperDocumentKind[] = [];
  if (/\bmark\s*scheme\b|\bmarkscheme\b|\bms\b/.test(normalized)) kinds.push("markscheme");
  if (/\bquestion\s*paper\b|\bqpaper\b|\bqp\b/.test(normalized)) kinds.push("question-paper");
  if (/\bdata\s*booklet\b/.test(normalized)) kinds.push("data-booklet");
  const levels: PaperLevel[] = [];
  if (/\bhl\b/.test(normalized)) levels.push("HL");
  if (/\bsl\b/.test(normalized)) levels.push("SL");
  return {
    documentKind: only(kinds),
    level: only(levels),
    paper: parsePaper(normalized),
    session,
    subject: parseSubject(normalized),
    timezone: only([...normalized.matchAll(/\btz\s*([0123abc])\b/g)].map((m) => "TZ" + m[1].toUpperCase())),
    year,
  };
}

export type PaperReviewHints = ParsedPaperMetadata & {
  mathematicsCourse?: "AA" | "AI";
  language?: "English" | "French" | "Spanish";
};

export function parsePaperReviewHints(filename: string): PaperReviewHints {
  const normalized = normalizedFilename(filename);
  const courses: Array<"AA" | "AI"> = [];
  if (/\baa\b|\banalysis\s+and\s+approaches\b/.test(normalized)) courses.push("AA");
  if (/\bai\b|\bapplications\s+and\s+interpretation\b/.test(normalized)) courses.push("AI");
  const languages: Array<"English" | "French" | "Spanish"> = [];
  if (/\benglish\b/.test(normalized)) languages.push("English");
  if (/\bfrench\b/.test(normalized)) languages.push("French");
  if (/\bspanish\b/.test(normalized)) languages.push("Spanish");
  return {
    ...parsePaperMetadata(filename),
    mathematicsCourse: only(courses),
    language: only(languages),
  };
}
