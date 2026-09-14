import { describe, expect, it } from "vitest";

import { classifyTopics } from "@/lib/taxonomy/classify";
import {
  expandIBDPTopicIds,
  findIBDPTopic,
} from "@/lib/taxonomy/ibdp";

describe("IBDP topic classification", () => {
  it("maps a specific-latent-heat heading to its Physics B.1 child topic", () => {
    expect(
      classifyTopics({
        subject: "physics",
        text: "",
        title: "B.1 Specific latent heat",
      }),
    ).toEqual({
      confidence: 0.98,
      method: "heading_rule",
      reason:
        "Matched the heading phrase 'specific latent heat'.",
      topicIds: [
        "physics.b.particulate-matter.specific-latent-heat",
      ],
    });
  });

  it("maps official Physics section headings at high confidence", () => {
    expect(
      classifyTopics({
        subject: "physics",
        text: "",
        title: "A.1 Kinematics",
      }),
    ).toMatchObject({
      confidence: 0.98,
      method: "heading_rule",
      topicIds: ["physics.a.kinematics"],
    });
  });

  it("maps current Chemistry Structure headings at high confidence", () => {
    expect(
      classifyTopics({
        subject: "chemistry",
        text: "",
        title: "Structure 2.2 — The covalent model",
      }),
    ).toMatchObject({
      confidence: 0.98,
      topicIds: [
        "chemistry.structure.bonding.covalent-model",
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
        "No trusted metadata, heading rule, or keyword rule matched.",
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
