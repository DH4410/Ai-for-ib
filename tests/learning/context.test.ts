import { describe, expect, it } from "vitest";

import { formatLearnerContext } from "@/lib/learning/context";

describe("learner context", () => {
  it("summarizes weak/due mastery and recurring mistakes without exposing event history", () => {
    const result = formatLearnerContext(
      [
        {
          attemptCount: 3,
          label: "Functions",
          masteryEstimate: 0.42,
          misconceptionTags: ["algebra", "formula"],
          nextReviewAt: "2026-09-13T10:00:00.000Z",
          subject: "mathematics",
          topicId: "mathematics.functions",
          updatedAt: "2026-09-12T18:00:00.000Z",
        },
      ],
      "2026-09-13T18:00:00.000Z",
    );

    expect(result).toContain("Functions · 42% mastery");
    expect(result).toContain("review due");
    expect(result).toContain(
      "recurring mistakes: algebra, formula",
    );
    expect(result).not.toContain("student_id");
  });

  it("has an explicit empty state", () => {
    expect(
      formatLearnerContext(
        [],
        "2026-09-13T18:00:00.000Z",
      ),
    ).toBe(
      "No saved mastery data is available for this subject.",
    );
  });
});
