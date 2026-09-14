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
});
