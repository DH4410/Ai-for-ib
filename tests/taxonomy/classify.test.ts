import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyTopics,
} from "@/lib/taxonomy/classify";
import {
  IBDP_TOPICS,
  expandIBDPTopicIds,
  findIBDPTopic,
} from "@/lib/taxonomy/ibdp";

function leafTopics() {
  const parentIds = new Set(
    IBDP_TOPICS.flatMap(({ parentId }) =>
      parentId ? [parentId] : [],
    ),
  );
  return IBDP_TOPICS.filter(
    ({ id }) => !parentIds.has(id),
  );
}

describe("IBDP topic classification", () => {
  it("maps a specific-latent-heat heading to its Physics B.1 child topic", () => {
    expect(
      classifyTopics({
        subject: "physics",
        text: "",
        title:
          "B.1 Specific latent heat",
      }),
    ).toMatchObject({
      confidence: 0.98,
      method: "heading_rule",
      topicIds: [
        "physics.b.particulate-matter.specific-latent-heat",
      ],
    });
  });

  it("classifies every canonical leaf topic from its taxonomy heading", () => {
    for (const topic of leafTopics()) {
      expect(
        classifyTopics({
          subject: topic.subject,
          text: "",
          title: topic.label,
        }),
        topic.id,
      ).toMatchObject({
        confidence: 0.98,
        method: "heading_rule",
        topicIds: [topic.id],
      });
    }
  });

  it("uses common Physics aliases and chooses the most specific matching phrase", () => {
    expect(
      classifyTopics({
        subject: "physics",
        text:
          "Use latent heat during the state change and compare it with other thermal energy transfers.",
        title: "Phase change",
      }),
    ).toMatchObject({
      confidence: 0.76,
      method: "keyword_rule",
      topicIds: [
        "physics.b.particulate-matter.specific-latent-heat",
      ],
    });

    expect(
      classifyTopics({
        subject: "physics",
        text:
          "Apply Faraday's law and Lenz's law to calculate the induced emf.",
        title: "Worked example",
      }),
    ).toMatchObject({
      topicIds: [
        "physics.d.induction",
      ],
    });
  });

  it("recognizes common Chemistry terminology outside official headings", () => {
    expect(
      classifyTopics({
        subject: "chemistry",
        text:
          "Use collision theory and activation energy to explain the change in reaction rate.",
        title: "Worked example",
      }),
    ).toMatchObject({
      method: "keyword_rule",
      topicIds: [
        "chemistry.reactivity.amount-rate-extent.rate",
      ],
    });

    expect(
      classifyTopics({
        subject: "chemistry",
        text:
          "Classify a sample as a pure substance, homogeneous mixture, or heterogeneous mixture.",
        title: "Review",
      }),
    ).toMatchObject({
      topicIds: [
        "chemistry.structure.models.particulate-introduction",
      ],
    });
  });

  it("recognizes common Mathematics AA alternate wording", () => {
    expect(
      classifyTopics({
        subject: "mathematics",
        text:
          "Use the chain rule to differentiate the function.",
        title: "Exercise",
      }),
    ).toMatchObject({
      topicIds: [
        "mathematics.calculus.differentiation",
      ],
    });

    expect(
      classifyTopics({
        subject: "mathematics",
        text:
          "Find a 95 percent confidence interval and carry out a hypothesis test.",
        title: "Statistics exercise",
      }),
    ).toMatchObject({
      topicIds: [
        "mathematics.statistics-probability.sampling-testing",
      ],
    });
  });

  it("uses the current Mathematics AA course version for the user's pre-2029 cohort", () => {
    expect(
      findIBDPTopic(
        "mathematics.number-algebra.exponents-logarithms",
      ),
    ).toMatchObject({
      syllabusVersion: "2021",
      subject: "mathematics",
    });
  });

  it("leaves a generic worksheet unqualified for strict topic selection", () => {
    expect(
      classifyTopics({
        subject: "chemistry",
        text: "Review questions",
        title: "Practice",
      }),
    ).toEqual({
      confidence: 0,
      method: "unclassified",
      reason:
        "No trusted metadata, canonical heading, or supported keyword alias matched.",
      topicIds: [],
    });
  });

  it("expands a specific topic to trusted syllabus ancestors for indexing", () => {
    expect(
      expandIBDPTopicIds([
        "physics.b.particulate-matter.specific-latent-heat",
      ]),
    ).toEqual([
      "physics.b.particulate-matter.specific-latent-heat",
      "physics.b.thermal-energy-transfers",
      "physics.b.particulate-matter",
    ]);
  });
});
