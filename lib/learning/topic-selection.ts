import {
  findIBDPTopic,
  topicIdWithAncestors,
} from "@/lib/taxonomy/ibdp";
import type { Subject } from "@/types/study";

export function mostSpecificTopicId(
  subject: Subject,
  topicIds: string[] | undefined,
): string {
  if (!topicIds?.length) {
    return "";
  }

  return topicIds
    .filter(
      (topicId) =>
        findIBDPTopic(topicId)?.subject ===
        subject,
    )
    .sort((left, right) => {
      const depthDifference =
        topicIdWithAncestors(right).length -
        topicIdWithAncestors(left).length;

      return (
        depthDifference ||
        left.localeCompare(right)
      );
    })[0] ?? "";
}
