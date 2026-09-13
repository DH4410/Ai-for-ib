import type { LearningProgressRow } from "@/lib/learning/repository";

export function formatLearnerContext(
  progress: LearningProgressRow[],
  now: string,
): string {
  if (progress.length === 0) {
    return "No saved mastery data is available for this subject.";
  }

  const nowTime = Date.parse(now);
  if (Number.isNaN(nowTime)) {
    throw new Error("now must be a valid ISO timestamp");
  }

  return progress
    .slice(0, 6)
    .map((item) => {
      const mastery = Math.round(item.masteryEstimate * 100);
      const due =
        Date.parse(item.nextReviewAt) <= nowTime
          ? "review due"
          : "review scheduled";
      const mistakes =
        item.misconceptionTags.length > 0
          ? ` · recurring mistakes: ${item.misconceptionTags.join(", ")}`
          : "";

      return (
        [
          item.label,
          `${mastery}% mastery`,
          `${item.attemptCount} attempt${item.attemptCount === 1 ? "" : "s"}`,
          due,
        ].join(" · ") + mistakes
      );
    })
    .join("\n");
}
