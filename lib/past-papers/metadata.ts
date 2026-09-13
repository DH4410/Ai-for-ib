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

function parseSubject(filename: string): Subject | undefined {
  if (/\bchem(?:istry)?\b/.test(filename)) {
    return "chemistry";
  }
  if (/\bphysics\b/.test(filename)) {
    return "physics";
  }
  if (/\bmath(?:ematics)?\b/.test(filename)) {
    return "mathematics";
  }

  return undefined;
}

function parseSessionAndYear(filename: string): Pick<ParsedPaperMetadata, "session" | "year"> {
  const compactSession = filename.match(/\b([mn])(20\d{2}|\d{2})\b/);
  if (compactSession) {
    const year = compactSession[2].length === 2 ? 2000 + Number(compactSession[2]) : Number(compactSession[2]);
    return { session: compactSession[1] === "m" ? "may" : "november", year };
  }

  const fullYear = filename.match(/\b(20\d{2})\b/);
  const session = /\bnov(?:ember)?\b/.test(filename)
    ? "november"
    : /\bmay\b/.test(filename)
      ? "may"
      : undefined;

  return { session, year: fullYear ? Number(fullYear[1]) : undefined };
}

function parsePaper(filename: string): string | undefined {
  const match = filename.match(/\b(?:paper\s*)?(1a|1b|[123])\b/);

  return match ? `p${match[1]}` : undefined;
}

export function parsePaperMetadata(filename: string): ParsedPaperMetadata {
  const normalized = normalizedFilename(filename);
  const { session, year } = parseSessionAndYear(normalized);
  const documentKind = /\bmark\s*scheme\b|\bmarkscheme\b|\bms\b/.test(normalized)
    ? "markscheme"
    : /\bquestion\s*paper\b|\bqpaper\b|\bqp\b/.test(normalized)
      ? "question-paper"
      : /\bdata\s*booklet\b/.test(normalized)
        ? "data-booklet"
        : undefined;
  const level = /\bhl\b/.test(normalized) ? "HL" : /\bsl\b/.test(normalized) ? "SL" : undefined;
  const timezone = normalized.match(/\btz([123abc])\b/)?.[0]?.toUpperCase();

  return {
    documentKind,
    level,
    paper: parsePaper(normalized),
    session,
    subject: parseSubject(normalized),
    timezone,
    year,
  };
}
