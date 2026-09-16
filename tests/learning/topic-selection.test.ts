import {
  describe,
  expect,
  it,
} from "vitest";

import {
  mostSpecificTopicId,
} from "@/lib/learning/topic-selection";

describe("learning topic selection", () => {
  it("prefers the deepest trusted topic regardless of source array order", () => {
    expect(
      mostSpecificTopicId("physics", [
        "physics.b.particulate-matter",
        "physics.b.particulate-matter.specific-latent-heat",
        "physics.b.thermal-energy-transfers",
      ]),
    ).toBe(
      "physics.b.particulate-matter.specific-latent-heat",
    );
  });

  it("ignores topics from another subject", () => {
    expect(
      mostSpecificTopicId("chemistry", [
        "physics.a.kinematics",
        "chemistry.reactivity.amount-rate-extent.rate",
      ]),
    ).toBe(
      "chemistry.reactivity.amount-rate-extent.rate",
    );
  });

  it("returns empty when no valid topic exists", () => {
    expect(
      mostSpecificTopicId(
        "mathematics",
        ["not-a-topic"],
      ),
    ).toBe("");
  });
});
