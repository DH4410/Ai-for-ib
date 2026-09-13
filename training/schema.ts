export const TRAINING_SUBJECTS = [
  "physics",
  "chemistry",
  "mathematics",
  "general",
] as const;

export const TRAINING_MODES = [
  "learn",
  "practice",
  "mark",
  "revise",
] as const;

export const TRAINING_DATA_ORIGINS = [
  "synthetic",
  "user-authored",
  "licensed-for-training",
] as const;

export const TRAINING_ROLES = ["system", "user", "assistant"] as const;

export type TrainingSubject = (typeof TRAINING_SUBJECTS)[number];
export type TrainingMode = (typeof TRAINING_MODES)[number];
export type TrainingDataOrigin = (typeof TRAINING_DATA_ORIGINS)[number];
export type TrainingRole = (typeof TRAINING_ROLES)[number];

export type TrainingMessage = {
  role: TrainingRole;
  content: string;
};

export type TrainingExample = {
  id: string;
  subject: TrainingSubject;
  mode: TrainingMode;
  dataOrigin: TrainingDataOrigin;
  prompt: TrainingMessage[];
  completion: [TrainingMessage];
  tags: string[];
};

export type TrainingDatasetSummary = {
  total: number;
  bySubject: Record<TrainingSubject, number>;
  byMode: Record<TrainingMode, number>;
  byDataOrigin: Record<TrainingDataOrigin, number>;
};

type UnknownRecord = Record<string, unknown>;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,127}$/;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_PROMPT_MESSAGES = 16;
const MAX_TAGS = 16;

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

function parseMessage(value: unknown, label: string): TrainingMessage {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  const role = enumValue(value, "role", TRAINING_ROLES);
  const content = requiredString(value, "content", MAX_MESSAGE_LENGTH);

  return { role, content };
}

function parsePrompt(value: unknown): TrainingMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("prompt must contain at least one message");
  }

  if (value.length > MAX_PROMPT_MESSAGES) {
    throw new Error(`prompt cannot contain more than ${MAX_PROMPT_MESSAGES} messages`);
  }

  const prompt = value.map((message, index) =>
    parseMessage(message, `prompt[${index}]`),
  );

  if (!prompt.some(({ role }) => role === "user")) {
    throw new Error("prompt must contain a user message");
  }

  if (prompt.at(-1)?.role !== "user") {
    throw new Error("prompt must end with a user message");
  }

  return prompt;
}

function parseCompletion(value: unknown): [TrainingMessage] {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("completion must contain exactly one assistant message");
  }

  const completion = parseMessage(value[0], "completion[0]");
  if (completion.role !== "assistant") {
    throw new Error("completion must use the assistant role");
  }

  return [completion];
}

function parseTags(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw new Error(`tags must be an array with at most ${MAX_TAGS} values`);
  }

  const tags = value.map((tag, index) => {
    if (typeof tag !== "string" || tag.trim().length === 0 || tag.trim().length > 64) {
      throw new Error(`tags[${index}] must be a short non-empty string`);
    }

    return tag.trim();
  });

  return [...new Set(tags)];
}

export function parseTrainingExample(value: unknown): TrainingExample {
  if (!isRecord(value)) {
    throw new Error("training example must be an object");
  }

  const id = requiredString(value, "id", 128);
  if (!ID_PATTERN.test(id)) {
    throw new Error("id must be a stable lowercase identifier");
  }

  return {
    id,
    subject: enumValue(value, "subject", TRAINING_SUBJECTS),
    mode: enumValue(value, "mode", TRAINING_MODES),
    dataOrigin: enumValue(value, "dataOrigin", TRAINING_DATA_ORIGINS),
    prompt: parsePrompt(value.prompt),
    completion: parseCompletion(value.completion),
    tags: parseTags(value.tags),
  };
}

export function parseTrainingJsonl(contents: string): TrainingExample[] {
  const examples: TrainingExample[] = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`invalid training JSON on line ${index + 1}`);
    }

    try {
      examples.push(parseTrainingExample(value));
    } catch (error) {
      throw new Error(
        `invalid training example on line ${index + 1}: ${(error as Error).message}`,
      );
    }
  });

  if (examples.length === 0) {
    throw new Error("training dataset must contain at least one example");
  }

  const ids = new Set<string>();
  for (const example of examples) {
    if (ids.has(example.id)) {
      throw new Error(`duplicate training example id: ${example.id}`);
    }
    ids.add(example.id);
  }

  return examples;
}

export function summarizeTrainingExamples(
  examples: TrainingExample[],
): TrainingDatasetSummary {
  const bySubject = Object.fromEntries(
    TRAINING_SUBJECTS.map((subject) => [subject, 0]),
  ) as Record<TrainingSubject, number>;
  const byMode = Object.fromEntries(
    TRAINING_MODES.map((mode) => [mode, 0]),
  ) as Record<TrainingMode, number>;
  const byDataOrigin = Object.fromEntries(
    TRAINING_DATA_ORIGINS.map((origin) => [origin, 0]),
  ) as Record<TrainingDataOrigin, number>;

  for (const example of examples) {
    bySubject[example.subject] += 1;
    byMode[example.mode] += 1;
    byDataOrigin[example.dataOrigin] += 1;
  }

  return {
    total: examples.length,
    bySubject,
    byMode,
    byDataOrigin,
  };
}
