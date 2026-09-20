import { describe, expect, it } from "vitest";

import { formatRealPastPaperPractice } from "@/lib/past-papers/practice";

describe("real past-paper practice formatting", () => {
  it("returns retrieved question wording directly without the internal prefix", () => {
    expect(
      formatRealPastPaperPractice([
        {
          id: "physics-q1",
          locator: "May 2025 · HL · P2 · Q4",
          text: "Question:\nCalculate the value. [2]",
          title: "Physics May 2025 HL Paper 2",
        },
      ]),
    ).toBe(
      "May 2025 · HL · P2 · Q4\n\nCalculate the value. [2]",
    );
  });

  it("warns when a real question requires a visual source the tutor has not interpreted", () => {
    const answer = formatRealPastPaperPractice([
      {
        documentType: "question-paper",
        id: "physics-q6",
        locator: "May 2025 · TZ2 · HL · P2 · Q6",
        text:
          "Question:\nUse the graph shown below to determine the gradient.",
        title: "Physics paper",
        visualContextRequired: true,
      },
    ]);

    expect(answer).toContain(
      "Visual source required",
    );
    expect(answer).toContain(
      "has not interpreted that visual",
    );
  });
});
