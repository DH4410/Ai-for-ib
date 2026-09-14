import type { StudyDocumentType } from "@/lib/study-source/types";
import type { ChatTurn, StudyMode, Subject } from "@/types/study";

const SUBJECTS: Subject[] = ["physics", "chemistry", "mathematics"];
const MODES: StudyMode[] = ["learn", "practice", "mark", "revise"];
const DOCUMENT_TYPES: StudyDocumentType[] = [
  "textbook",
  "study-guide",
  "workbook",
  "worksheet",
  "syllabus",
  "data-booklet",
  "notes",
  "question-paper",
  "markscheme",
  "specimen-paper",
  "other",
];

export type ChatRequestFilters = {
  documentTypes?: StudyDocumentType[];
  explanationLevel?: "simple" | "standard" | "full";
  hintsFirst?: boolean;
  paper?: string;
  pastPaperQuestionId?: string;
  realPastPapersOnly?: boolean;
  topicIds?: string[];
  years?: number[];
};

export type ParsedChatRequest = {
  subject: Subject;
  mode: StudyMode;
  message: string;
  history: ChatTurn[];
  filters?: ChatRequestFilters;
};

export class ChatRequestValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): never {
  throw new ChatRequestValidationError(message);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 10 || value.some((item) => typeof item !== "string" || !item.trim())) {
    return invalid(`${field} must be an array of at most 10 non-empty strings`);
  }

  return [...new Set(value.map((item) => item.trim()))];
}

function parseFilters(value: unknown): ChatRequestFilters | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return invalid("filters must be an object");
  }

  const filters: ChatRequestFilters = {};
  if (value.topicIds !== undefined) {
    filters.topicIds = parseStringArray(value.topicIds, "filters.topicIds");
  }
  if (value.documentTypes !== undefined) {
    const documentTypes = parseStringArray(value.documentTypes, "filters.documentTypes");
    if (documentTypes.some((documentType) => !DOCUMENT_TYPES.includes(documentType as StudyDocumentType))) {
      return invalid("filters.documentTypes contains an unsupported document type");
    }
    filters.documentTypes = documentTypes as StudyDocumentType[];
  }
  if (value.years !== undefined) {
    if (
      !Array.isArray(value.years) ||
      value.years.length > 10 ||
      value.years.some((year) => !Number.isInteger(year) || year < 2020 || year > 2030)
    ) {
      return invalid("filters.years must contain at most 10 years between 2020 and 2030");
    }
    filters.years = [...new Set(value.years as number[])];
  }
  if (value.paper !== undefined) {
    if (typeof value.paper !== "string" || !/^p(?:1a|1b|[123])$/i.test(value.paper)) {
      return invalid("filters.paper must be one of p1a, p1b, p1, p2, or p3");
    }
    filters.paper = value.paper.toLocaleLowerCase();
  }
  if (value.pastPaperQuestionId !== undefined) {
    if (
      typeof value.pastPaperQuestionId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(
        value.pastPaperQuestionId,
      )
    ) {
      return invalid(
        "filters.pastPaperQuestionId must be a valid question identifier",
      );
    }
    filters.pastPaperQuestionId =
      value.pastPaperQuestionId;
  }
  for (const booleanField of ["realPastPapersOnly", "hintsFirst"] as const) {
    if (value[booleanField] !== undefined) {
      if (typeof value[booleanField] !== "boolean") {
        return invalid(`filters.${booleanField} must be true or false`);
      }
      filters[booleanField] = value[booleanField];
    }
  }
  if (value.explanationLevel !== undefined) {
    if (!["simple", "standard", "full"].includes(value.explanationLevel as string)) {
      return invalid("filters.explanationLevel must be simple, standard, or full");
    }
    filters.explanationLevel = value.explanationLevel as ChatRequestFilters["explanationLevel"];
  }

  return filters;
}

function parseHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (turn): turn is ChatTurn =>
        isRecord(turn) &&
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0,
    )
    .slice(-12)
    .map((turn) => ({ ...turn, content: turn.content.trim() }));
}

export function parseChatRequest(value: unknown): ParsedChatRequest {
  if (!isRecord(value)) {
    return invalid("request body must be an object");
  }
  if (typeof value.subject !== "string" || !SUBJECTS.includes(value.subject as Subject)) {
    return invalid("subject must be chemistry, physics, or mathematics");
  }
  if (typeof value.mode !== "string" || !MODES.includes(value.mode as StudyMode)) {
    return invalid("mode must be learn, practice, mark, or revise");
  }
  if (typeof value.message !== "string" || value.message.trim().length === 0 || value.message.length > 8000) {
    return invalid("message must be a non-empty string up to 8000 characters");
  }

  return {
    filters: parseFilters(value.filters),
    history: parseHistory(value.history),
    message: value.message.trim(),
    mode: value.mode as StudyMode,
    subject: value.subject as Subject,
  };
}
