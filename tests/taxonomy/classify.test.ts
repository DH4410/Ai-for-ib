import { describe, expect, it } from "vitest";

import { classifyTopics } from "@/lib/taxonomy/classify";

describe("IBDP topic classification", () => {
  it("maps a trusted Physics heading to its Theme B topic with a reason", () => {
    expect(
      classifyTopics({
        subject: "physics",
        text: "",
        title: "B.1 Specific latent heat",
      }),
    ).toEqual({
      confidence: 0.98,
      method: "heading_rule",
      reason: "Matched the heading phrase 'specific latent heat'.",
      topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
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
      reason: "No trusted metadata, heading rule, or keyword rule matched.",
      topicIds: [],
    });
  });
});
