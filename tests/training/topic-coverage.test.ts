import {
  describe,
  expect,
  it,
} from "vitest";

import {
  summarizeTopicCoverage,
} from "@/training/topic-coverage";
import {
  parseTrainingExample,
} from "@/training/schema";

describe("training topic coverage", () => {
  it("reports direct leaf-topic coverage without pretending a parent tag covers every child", () => {
    const items = [
      parseTrainingExample({
        completion: [
          {
            role: "assistant",
            content: "Synthetic answer.",
          },
        ],
        dataOrigin: "synthetic",
        id: "physics-topic-001",
        mode: "learn",
        prompt: [
          {
            role: "user",
            content: "Synthetic question.",
          },
        ],
        subject: "physics",
        tags: [],
        topicIds: [
          "physics.b.particulate-matter.specific-latent-heat",
        ],
      }),
      parseTrainingExample({
        completion: [
          {
            role: "assistant",
            content: "Synthetic answer.",
          },
        ],
        dataOrigin: "synthetic",
        id: "physics-topic-002",
        mode: "revise",
        prompt: [
          {
            role: "user",
            content: "Synthetic question two.",
          },
        ],
        subject: "physics",
        tags: [],
        topicIds: [
          "physics.c.wave-behaviour",
        ],
      }),
    ];

    const physics = summarizeTopicCoverage(
      items,
    ).find(
      ({ subject }) => subject === "physics",
    );

    expect(
      physics?.directlyCoveredLeafTopicIds,
    ).toContain(
      "physics.b.particulate-matter.specific-latent-heat",
    );
    expect(
      physics?.directlyCoveredLeafTopicIds,
    ).not.toContain(
      "physics.c.wave-behaviour",
    );
    expect(
      physics?.uncoveredLeafTopicIds.length,
    ).toBeGreaterThan(0);
  });
});
