import type { Subject } from "@/types/study";

export type LearningAttempt = {
  subject: Subject;
  topicId: string;
  score: number;
  maximumMarks: number;
  hintsUsed: number;
  confidence?: number | null;
  misconceptionTags?: string[];
  occurredAt: string;
};

export type TopicMasteryState = {
  subject: Subject;
  topicId: string;
  masteryEstimate: number;
  attemptCount: number;
  nextReviewAt: string;
  updatedAt: string;
};

export type MasteryUpdate = TopicMasteryState & {
  evidenceScore: number;
  scoreRatio: number;
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertAttempt(attempt: LearningAttempt): void {
  if (!attempt.topicId.trim()) {
    throw new Error("topicId must be non-empty");
  }
  if (!Number.isFinite(attempt.score) || attempt.score < 0) {
    throw new Error("score must be a non-negative number");
  }
  if (
    !Number.isFinite(attempt.maximumMarks) ||
    attempt.maximumMarks <= 0
  ) {
    throw new Error("maximumMarks must be greater than zero");
  }
  if (attempt.score > attempt.maximumMarks) {
    throw new Error("score cannot exceed maximumMarks");
  }
  if (!Number.isSafeInteger(attempt.hintsUsed) || attempt.hintsUsed < 0) {
    throw new Error("hintsUsed must be a non-negative integer");
  }
  if (
    attempt.confidence !== undefined &&
    attempt.confidence !== null &&
    (!Number.isFinite(attempt.confidence) ||
      attempt.confidence < 0 ||
      attempt.confidence > 1)
  ) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (Number.isNaN(Date.parse(attempt.occurredAt))) {
    throw new Error("occurredAt must be an ISO timestamp");
  }
}

function reviewIntervalDays(
  masteryEstimate: number,
  scoreRatio: number,
): number {
  if (scoreRatio < 0.5) {
    return 1;
  }
  if (masteryEstimate < 0.4) {
    return 1;
  }
  if (masteryEstimate < 0.55) {
    return 2;
  }
  if (masteryEstimate < 0.7) {
    return 4;
  }
  if (masteryEstimate < 0.82) {
    return 7;
  }
  if (masteryEstimate < 0.92) {
    return 14;
  }
  return 30;
}

function addUtcDays(isoTimestamp: string, days: number): string {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * A transparent V1 mastery estimate.
 *
 * It is intentionally deterministic and separate from the LLM:
 * - marks provide the main evidence;
 * - hints reduce the evidence slightly;
 * - confidence affects only severe overconfidence, not correctness itself;
 * - repeated evidence moves mastery gradually rather than jumping to 0/1.
 */
export function updateTopicMastery(
  previous: TopicMasteryState | null,
  attempt: LearningAttempt,
): MasteryUpdate {
  assertAttempt(attempt);

  if (
    previous &&
    (previous.topicId !== attempt.topicId ||
      previous.subject !== attempt.subject)
  ) {
    throw new Error("previous mastery does not match the attempt topic");
  }

  const scoreRatio = attempt.score / attempt.maximumMarks;
  const hintPenalty = Math.min(attempt.hintsUsed * 0.05, 0.2);
  const overconfidencePenalty =
    attempt.confidence !== undefined &&
    attempt.confidence !== null &&
    attempt.confidence >= 0.8 &&
    scoreRatio < 0.5
      ? 0.08
      : 0;
  const evidenceScore = clamp(
    scoreRatio - hintPenalty - overconfidencePenalty,
  );

  const baseline = previous?.masteryEstimate ?? 0.35;
  const evidenceWeight = previous ? 0.35 : 0.55;
  const masteryEstimate = clamp(
    baseline * (1 - evidenceWeight) +
      evidenceScore * evidenceWeight,
  );
  const roundedMastery = Math.round(masteryEstimate * 1000) / 1000;
  const intervalDays = reviewIntervalDays(roundedMastery, scoreRatio);

  return {
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    evidenceScore:
      Math.round(evidenceScore * 1000) / 1000,
    masteryEstimate: roundedMastery,
    nextReviewAt: addUtcDays(attempt.occurredAt, intervalDays),
    scoreRatio: Math.round(scoreRatio * 1000) / 1000,
    subject: attempt.subject,
    topicId: attempt.topicId,
    updatedAt: attempt.occurredAt,
  };
}

export function isReviewDue(
  mastery: TopicMasteryState,
  now: string,
): boolean {
  const nowTime = Date.parse(now);
  const reviewTime = Date.parse(mastery.nextReviewAt);

  if (Number.isNaN(nowTime) || Number.isNaN(reviewTime)) {
    throw new Error("review timestamps must be valid ISO dates");
  }

  return reviewTime <= nowTime;
}
