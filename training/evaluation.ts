import {
  TRAINING_MODES,
  TRAINING_ROLES,
  TRAINING_SUBJECTS,
  type TrainingMessage,
  type TrainingMode,
  type TrainingSubject,
} from "@/training/schema";

type UnknownRecord = Record<string, unknown>;

export type EvaluationRubric = {
  requiredConceptGroups: string[][];
  forbiddenPhrases: string[];
  maxWords?: number;
  shouldAskLearnerQuestion: boolean;
};

export type EvaluationCase = {
  id: string;
  subject: TrainingSubject;
  mode: TrainingMode;
  prompt: TrainingMessage[];
  rubric: EvaluationRubric;
};

export type MechanicalEvaluation = {
  conceptGroupsMatched: number;
  conceptGroupsTotal: number;
  conceptCoverage: number;
  forbiddenHits: string[];
  wordCount: number;
  withinWordLimit: boolean;
  askedLearnerQuestion: boolean;
  learnerQuestionRequirementPassed: boolean;
  guardrailsPassed: boolean;
};

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,127}$/;
const MAX_PROMPT_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 20_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: UnknownRecord, key: string, maxLength = 256): string {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${key} is too long`);
  }

  return normalized;
}

function enumValue<T extends readonly string[]>(
  record: UnknownRecord,
  key: string,
  allowed: T,
): T[number] {
  const value = requiredString(record, key, 64);

  if (!allowed.includes(value)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}`);
  }

  return value as T[number];
}

function parsePrompt(value: unknown): TrainingMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PROMPT_MESSAGES) {
    throw new Error(`prompt must contain 1-${MAX_PROMPT_MESSAGES} messages`);
  }

  const prompt = value.map((message, index) => {
    if (!isRecord(message)) {
      throw new Error(`prompt[${index}] must be an object`);
    }

    return {
      role: enumValue(message, "role", TRAINING_ROLES),
      content: requiredString(message, "content", MAX_MESSAGE_LENGTH),
    };
  });

  if (!prompt.some(({ role }) => role === "user")) {
    throw new Error("prompt must contain a user message");
  }

  if (prompt.at(-1)?.role !== "user") {
    throw new Error("prompt must end with a user message");
  }

  return prompt;
}

function parseStringList(value: unknown, label: string, maxItems = 24): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${label} must be an array with at most ${maxItems} values`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > 160) {
      throw new Error(`${label}[${index}] must be a short non-empty string`);
    }

    return item.trim();
  });
}

function parseRequiredConceptGroups(value: unknown): string[][] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) {
    throw new Error("requiredConceptGroups must contain 1-24 concept groups");
  }

  return value.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length === 0 || group.length > 8) {
      throw new Error(
        `requiredConceptGroups[${groupIndex}] must contain 1-8 acceptable phrases`,
      );
    }

    return group.map((phrase, phraseIndex) => {
      if (
        typeof phrase !== "string" ||
        phrase.trim().length === 0 ||
        phrase.trim().length > 160
      ) {
        throw new Error(
          `requiredConceptGroups[${groupIndex}][${phraseIndex}] must be a short phrase`,
        );
      }

      return phrase.trim();
    });
  });
}

function parseRubric(value: unknown): EvaluationRubric {
  if (!isRecord(value)) {
    throw new Error("rubric must be an object");
  }

  const maxWords = value.maxWords;
  if (
    maxWords !== undefined &&
    (!Number.isSafeInteger(maxWords) || (maxWords as number) < 20 || (maxWords as number) > 2_000)
  ) {
    throw new Error("rubric.maxWords must be an integer from 20 to 2000");
  }

  const shouldAskLearnerQuestion = value.shouldAskLearnerQuestion;
  if (
    shouldAskLearnerQuestion !== undefined &&
    typeof shouldAskLearnerQuestion !== "boolean"
  ) {
    throw new Error("rubric.shouldAskLearnerQuestion must be a boolean");
  }

  return {
    requiredConceptGroups: parseRequiredConceptGroups(value.requiredConceptGroups),
    forbiddenPhrases: parseStringList(value.forbiddenPhrases, "rubric.forbiddenPhrases"),
    maxWords: maxWords as number | undefined,
    shouldAskLearnerQuestion: shouldAskLearnerQuestion === true,
  };
}

export function parseEvaluationCase(value: unknown): EvaluationCase {
  if (!isRecord(value)) {
    throw new Error("evaluation case must be an object");
  }

  const id = requiredString(value, "id", 128);
  if (!ID_PATTERN.test(id)) {
    throw new Error("id must be a stable lowercase identifier");
  }

  return {
    id,
    subject: enumValue(value, "subject", TRAINING_SUBJECTS),
    mode: enumValue(value, "mode", TRAINING_MODES),
    prompt: parsePrompt(value.prompt),
    rubric: parseRubric(value.rubric),
  };
}

export function parseEvaluationJsonl(contents: string): EvaluationCase[] {
  const cases: EvaluationCase[] = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid evaluation JSON on line ${index + 1}`);
    }

    try {
      cases.push(parseEvaluationCase(parsed));
    } catch (error) {
      throw new Error(
        `invalid evaluation case on line ${index + 1}: ${(error as Error).message}`,
      );
    }
  });

  if (cases.length === 0) {
    throw new Error("evaluation dataset must contain at least one case");
  }

  const ids = new Set<string>();
  for (const evaluationCase of cases) {
    if (ids.has(evaluationCase.id)) {
      throw new Error(`duplicate evaluation case id: ${evaluationCase.id}`);
    }
    ids.add(evaluationCase.id);
  }

  return cases;
}

function normalizeForMatching(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  const normalized = text.trim();
  return normalized.length === 0 ? 0 : normalized.split(/\s+/).length;
}

/**
 * Deterministic, deliberately limited checks.
 *
 * These metrics help compare two models on the same private benchmark, but they
 * are not a substitute for human correctness/pedagogy review.
 */
export function scoreEvaluationResponse(
  responseText: string,
  rubric: EvaluationRubric,
): MechanicalEvaluation {
  const normalized = normalizeForMatching(responseText);

  const conceptGroupsMatched = rubric.requiredConceptGroups.filter((group) =>
    group.some((phrase) => normalized.includes(normalizeForMatching(phrase))),
  ).length;

  const forbiddenHits = rubric.forbiddenPhrases.filter((phrase) =>
    normalized.includes(normalizeForMatching(phrase)),
  );

  const words = wordCount(responseText);
  const withinWordLimit = rubric.maxWords === undefined || words <= rubric.maxWords;
  const askedLearnerQuestion = responseText.includes("?");
  const learnerQuestionRequirementPassed =
    !rubric.shouldAskLearnerQuestion || askedLearnerQuestion;

  return {
    conceptGroupsMatched,
    conceptGroupsTotal: rubric.requiredConceptGroups.length,
    conceptCoverage: conceptGroupsMatched / rubric.requiredConceptGroups.length,
    forbiddenHits,
    wordCount: words,
    withinWordLimit,
    askedLearnerQuestion,
    learnerQuestionRequirementPassed,
    guardrailsPassed:
      forbiddenHits.length === 0 &&
      withinWordLimit &&
      learnerQuestionRequirementPassed,
  };
}
