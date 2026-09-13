import { findIBDPTopic } from "@/lib/taxonomy/ibdp";
import type { Subject } from "@/types/study";

export type TopicClassificationMethod =
  | "manual_metadata"
  | "heading_rule"
  | "keyword_rule"
  | "unclassified";

export type TopicClassification = {
  topicIds: string[];
  confidence: number;
  method: TopicClassificationMethod;
  reason: string;
};

export type TopicClassificationInput = {
  subject: Subject;
  title: string;
  text: string;
  manualTopicIds?: string[];
};

type ClassificationRule = {
  subject: Subject;
  phrase: string;
  topicId: string;
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    phrase: "specific latent heat",
    subject: "physics",
    topicId: "physics.b.particulate-matter.specific-latent-heat",
  },
  {
    phrase: "stoichiometry",
    subject: "chemistry",
    topicId: "chemistry.reactivity.amount-rate-extent",
  },
  {
    phrase: "exponentials",
    subject: "mathematics",
    topicId: "mathematics.number-algebra",
  },
  {
    phrase: "logarithms",
    subject: "mathematics",
    topicId: "mathematics.number-algebra",
  },
];

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function reasonFor(phrase: string, type: "heading" | "keyword"): string {
  return `Matched the ${type} phrase '${phrase}'.`;
}

export function classifyTopics(input: TopicClassificationInput): TopicClassification {
  const manualTopicIds = input.manualTopicIds?.filter((topicId) => {
    return findIBDPTopic(topicId)?.subject === input.subject;
  }) ?? [];
  if (manualTopicIds.length > 0) {
    return {
      confidence: 1,
      method: "manual_metadata",
      reason: "Used trusted source metadata.",
      topicIds: [...new Set(manualTopicIds)],
    };
  }

  const heading = normalize(input.title);
  const matchingHeadingRule = CLASSIFICATION_RULES.find(
    (rule) => rule.subject === input.subject && heading.includes(rule.phrase),
  );
  if (matchingHeadingRule) {
    return {
      confidence: 0.98,
      method: "heading_rule",
      reason: reasonFor(matchingHeadingRule.phrase, "heading"),
      topicIds: [matchingHeadingRule.topicId],
    };
  }

  const searchableText = `${heading} ${normalize(input.text)}`;
  const matchingKeywordRule = CLASSIFICATION_RULES.find(
    (rule) => rule.subject === input.subject && searchableText.includes(rule.phrase),
  );
  if (matchingKeywordRule) {
    return {
      confidence: 0.72,
      method: "keyword_rule",
      reason: reasonFor(matchingKeywordRule.phrase, "keyword"),
      topicIds: [matchingKeywordRule.topicId],
    };
  }

  return {
    confidence: 0,
    method: "unclassified",
    reason: "No trusted metadata, heading rule, or keyword rule matched.",
    topicIds: [],
  };
}
