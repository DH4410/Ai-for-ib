import { describe, expect, it, vi } from "vitest";

import { createProgressHandlers } from "@/app/api/progress/route";
import {
  InMemoryLearningProgressRepository,
} from "@/lib/learning/repository";
import { AuthenticationError } from "@/lib/auth/request-user";

const studentId =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("progress API", () => {
  it("records an authenticated attempt and returns updated mastery", async () => {
    const repository =
      new InMemoryLearningProgressRepository();
    const handlers = createProgressHandlers({
      now: () => "2026-09-13T18:00:00.000Z",
      repository,
      resolveUserId: async () => studentId,
    });

    const response = await handlers.POST(
      new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          confidence: 0.7,
          hintsUsed: 0,
          maximumMarks: 10,
          score: 8,
          subject: "physics",
          topicId:
            "physics.b.particulate-matter",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      mastery: { masteryEstimate: number };
    };

    expect(response.status).toBe(200);
    expect(body.mastery.masteryEstimate).toBe(0.598);

    const progress =
      await repository.listTopicMastery(
        studentId,
        "physics",
      );
    expect(progress).toHaveLength(1);
  });

  it("returns 401 when the access token cannot be authenticated", async () => {
    const handlers = createProgressHandlers({
      now: () => "2026-09-13T18:00:00.000Z",
      repository:
        new InMemoryLearningProgressRepository(),
      resolveUserId: vi.fn(async () => {
        throw new AuthenticationError("invalid session");
      }),
    });

    const response = await handlers.GET(
      new Request(
        "http://localhost/api/progress?subject=physics",
      ),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a topic from the wrong subject before writing progress", async () => {
    const repository =
      new InMemoryLearningProgressRepository();
    const handlers = createProgressHandlers({
      now: () =>
        "2026-09-13T18:00:00.000Z",
      repository,
      resolveUserId: async () =>
        studentId,
    });

    const response = await handlers.POST(
      new Request(
        "http://localhost/api/progress",
        {
          body: JSON.stringify({
            maximumMarks: 5,
            score: 4,
            subject: "physics",
            topicId:
              "chemistry.reactivity",
          }),
          headers: {
            "Content-Type":
              "application/json",
          },
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(
      await response.json(),
    ).toMatchObject({
      error:
        "topicId must belong to the selected subject taxonomy",
    });
    expect(
      await repository.listTopicMastery(
        studentId,
      ),
    ).toEqual([]);
  });

  it("rejects impossible scores before writing progress", async () => {
    const repository =
      new InMemoryLearningProgressRepository();
    const handlers = createProgressHandlers({
      now: () => "2026-09-13T18:00:00.000Z",
      repository,
      resolveUserId: async () => studentId,
    });

    const response = await handlers.POST(
      new Request("http://localhost/api/progress", {
        body: JSON.stringify({
          maximumMarks: 5,
          score: 6,
          subject: "chemistry",
          topicId: "chemistry.reactivity",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(
      await repository.listTopicMastery(studentId),
    ).toEqual([]);
  });
});
