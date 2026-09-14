import { describe, expect, it } from "vitest";

import { formatSourceLocator, fuseRankings } from "@/lib/retrieval/ranking";

const physicsB1 = {
  documentId: "physics-oxford-2023",
  documentType: "textbook" as const,
  id: "physics-b1-p43",
  locator: "Theme B.1 — p. 43",
  pageEnd: 43,
  pageStart: 43,
  score: 0.95,
  subject: "physics" as const,
  text: "Specific latent heat is energy transferred during a state change.",
  title: "Physics Course Companion",
  topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
};

const chemistryLatentHeat = {
  ...physicsB1,
  id: "chemistry-s1-p43",
  score: 0.99,
  subject: "chemistry" as const,
  title: "Chemistry Course Book",
};

const mathematicsHeatMap = {
  ...physicsB1,
  id: "mathematics-p43",
  score: 0.9,
  subject: "mathematics" as const,
  title: "Mathematics Book",
};

describe("hybrid source ranking", () => {
  it("fuses candidate sets only after strict subject filtering", () => {
    const ranked = fuseRankings({
      lexical: [physicsB1, chemistryLatentHeat],
      limit: 2,
      subject: "physics",
      vector: [physicsB1, mathematicsHeatMap],
    });

    expect(ranked.map(({ id }) => id)).toEqual(["physics-b1-p43"]);
  });

  it("interleaves distinct documents before filling extra passages from one source", () => {
    const secondOxfordChunk = {
      ...physicsB1,
      id: "physics-b1-p44",
      locator: "Theme B.1 — p. 44",
      pageEnd: 44,
      pageStart: 44,
    };
    const physicsGuideChunk = {
      ...physicsB1,
      documentId: "physics-study-guide",
      id: "physics-guide-b1",
      locator: "Thermal physics — p. 12",
      pageEnd: 12,
      pageStart: 12,
      title: "Physics Study Guide",
    };

    const ranked = fuseRankings({
      lexical: [
        physicsB1,
        secondOxfordChunk,
        physicsGuideChunk,
      ],
      limit: 3,
      subject: "physics",
      vector: [
        physicsB1,
        secondOxfordChunk,
        physicsGuideChunk,
      ],
    });

    expect(ranked.map(({ id }) => id)).toEqual([
      "physics-b1-p43",
      "physics-guide-b1",
      "physics-b1-p44",
    ]);
  });

  it("formats a textbook source with its topic and page locator", () => {
    expect(formatSourceLocator(physicsB1)).toBe(
      "Physics Course Companion — Theme B.1 — p. 43",
    );
  });
});
