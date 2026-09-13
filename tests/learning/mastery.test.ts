import { describe, expect, it } from "vitest";

import {
  isReviewDue,
  updateTopicMastery,
} from "@/lib/learning/mastery";

describe("topic mastery", () => {
  it("builds a cautious first mastery estimate and schedules review", () => {
    const result = updateTopicMastery(null, {
      confidence: 0.7,
      hintsUsed: 0,
      maximumMarks: 10,
      occurredAt: "2026-09-13T18:00:00.000Z",
      score: 8,
      subject: "physics",
      topicId: "physics.b.particulate-matter",
    });

    expect(result).toMatchObject({
      attemptCount: 1,
      evidenceScore: 0.8,
      masteryEstimate: 0.598,
      scoreRatio: 0.8,
    });
    expect(result.nextReviewAt).toBe(
      "2026-09-17T18:00:00.000Z",
    );
  });

  it("penalizes hints and severe overconfidence on a weak attempt", () => {
    const result = updateTopicMastery(
      {
        attemptCount: 3,
        masteryEstimate: 0.7,
        nextReviewAt: "2026-09-20T18:00:00.000Z",
        subject: "chemistry",
        topicId: "chemistry.reactivity",
        updatedAt: "2026-09-12T18:00:00.000Z",
      },
      {
        confidence: 0.9,
        hintsUsed: 2,
        maximumMarks: 10,
        occurredAt: "2026-09-13T18:00:00.000Z",
        score: 3,
        subject: "chemistry",
        topicId: "chemistry.reactivity",
      },
    );

    expect(result.evidenceScore).toBe(0.12);
    expect(result.masteryEstimate).toBe(0.497);
    expect(result.nextReviewAt).toBe(
      "2026-09-14T18:00:00.000Z",
    );
  });

  it("detects when a scheduled review is due", () => {
    expect(
      isReviewDue(
        {
          attemptCount: 2,
          masteryEstimate: 0.5,
          nextReviewAt: "2026-09-13T10:00:00.000Z",
          subject: "mathematics",
          topicId: "mathematics.functions",
          updatedAt: "2026-09-11T10:00:00.000Z",
        },
        "2026-09-13T18:00:00.000Z",
      ),
    ).toBe(true);
  });
});
