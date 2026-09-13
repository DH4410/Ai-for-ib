import { describe, expect, it } from "vitest";

import {
  InMemoryLearningProgressRepository,
  SupabaseLearningProgressRepository,
  type LearningProgressRepository,
} from "@/lib/learning/repository";

const studentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("learning progress repository", () => {
  it("stores and returns the weakest topics first in memory", async () => {
    const repository: LearningProgressRepository =
      new InMemoryLearningProgressRepository();

    await repository.recordAttempt(
      studentId,
      {
        hintsUsed: 0,
        maximumMarks: 5,
        occurredAt: "2026-09-13T18:00:00.000Z",
        score: 4,
        subject: "physics",
        topicId: "physics.b.particulate-matter",
      },
      {
        attemptCount: 1,
        masteryEstimate: 0.7,
        nextReviewAt: "2026-09-20T18:00:00.000Z",
        subject: "physics",
        topicId: "physics.b.particulate-matter",
        updatedAt: "2026-09-13T18:00:00.000Z",
      },
    );
    await repository.recordAttempt(
      studentId,
      {
        hintsUsed: 1,
        maximumMarks: 5,
        occurredAt: "2026-09-13T18:00:00.000Z",
        score: 2,
        subject: "physics",
        topicId: "physics.c.wave-behaviour",
      },
      {
        attemptCount: 1,
        masteryEstimate: 0.4,
        nextReviewAt: "2026-09-14T18:00:00.000Z",
        subject: "physics",
        topicId: "physics.c.wave-behaviour",
        updatedAt: "2026-09-13T18:00:00.000Z",
      },
    );

    const result = await repository.listTopicMastery(
      studentId,
      "physics",
    );

    expect(result.map(({ topicId }) => topicId)).toEqual([
      "physics.c.wave-behaviour",
      "physics.b.particulate-matter",
    ]);
  });

  it("uses only server RPCs for persistent learner data", async () => {
    const calls: Array<{
      name: string;
      parameters: Record<string, unknown>;
    }> = [];
    const repository = new SupabaseLearningProgressRepository({
      async rpc(name: string, parameters: Record<string, unknown>) {
        calls.push({ name, parameters });

        if (name === "get_private_learning_progress") {
          return {
            data: [
              {
                attempt_count: 2,
                label: "Functions",
                mastery_estimate: 0.62,
                next_review_at:
                  "2026-09-17T18:00:00.000Z",
                subject: "mathematics",
                topic_id: "mathematics.functions",
                updated_at: "2026-09-13T18:00:00.000Z",
              },
            ],
            error: null,
          };
        }

        return { data: null, error: null };
      },
    } as never);

    await repository.recordAttempt(
      studentId,
      {
        confidence: 0.7,
        hintsUsed: 0,
        maximumMarks: 4,
        occurredAt: "2026-09-13T18:00:00.000Z",
        score: 3,
        subject: "mathematics",
        topicId: "mathematics.functions",
      },
      {
        attemptCount: 2,
        masteryEstimate: 0.62,
        nextReviewAt: "2026-09-17T18:00:00.000Z",
        subject: "mathematics",
        topicId: "mathematics.functions",
        updatedAt: "2026-09-13T18:00:00.000Z",
      },
    );

    const progress = await repository.listTopicMastery(
      studentId,
      "mathematics",
    );

    expect(calls.map(({ name }) => name)).toEqual([
      "record_private_learning_attempt",
      "get_private_learning_progress",
    ]);
    expect(progress[0]).toMatchObject({
      label: "Functions",
      masteryEstimate: 0.62,
      topicId: "mathematics.functions",
    });
  });
});
