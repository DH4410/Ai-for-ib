import {
  IBDP_TOPICS,
  type IBDPTopic,
} from "@/lib/taxonomy/ibdp";
import type {
  EvaluationCase,
} from "@/training/evaluation";
import type {
  TrainingExample,
} from "@/training/schema";
import type { Subject } from "@/types/study";

const CORE_SUBJECTS: Subject[] = [
  "physics",
  "chemistry",
  "mathematics",
];

type TopicTaggedCase = Pick<
  TrainingExample | EvaluationCase,
  "subject" | "topicIds"
>;

export type SubjectTopicCoverage = {
  subject: Subject;
  leafTopicCount: number;
  directlyCoveredLeafTopicIds: string[];
  uncoveredLeafTopicIds: string[];
  taggedCases: number;
  untaggedCases: number;
};

function leafTopics(
  subject: Subject,
): IBDPTopic[] {
  const topics = IBDP_TOPICS.filter(
    (topic) => topic.subject === subject,
  );
  const parentIds = new Set(
    topics
      .map(({ parentId }) => parentId)
      .filter(
        (parentId): parentId is string =>
          Boolean(parentId),
      ),
  );

  return topics.filter(
    ({ id }) => !parentIds.has(id),
  );
}

export function summarizeTopicCoverage(
  cases: TopicTaggedCase[],
): SubjectTopicCoverage[] {
  return CORE_SUBJECTS.map((subject) => {
    const subjectCases = cases.filter(
      (item) => item.subject === subject,
    );
    const leaves = leafTopics(subject);
    const leafIds = new Set(
      leaves.map(({ id }) => id),
    );
    const directlyCovered = new Set<string>();

    for (const item of subjectCases) {
      for (const topicId of item.topicIds ?? []) {
        if (leafIds.has(topicId)) {
          directlyCovered.add(topicId);
        }
      }
    }

    return {
      subject,
      leafTopicCount: leaves.length,
      directlyCoveredLeafTopicIds: [
        ...directlyCovered,
      ].sort(),
      uncoveredLeafTopicIds: leaves
        .map(({ id }) => id)
        .filter(
          (topicId) =>
            !directlyCovered.has(topicId),
        )
        .sort(),
      taggedCases: subjectCases.filter(
        ({ topicIds }) =>
          (topicIds?.length ?? 0) > 0,
      ).length,
      untaggedCases: subjectCases.filter(
        ({ topicIds }) =>
          (topicIds?.length ?? 0) === 0,
      ).length,
    };
  });
}
