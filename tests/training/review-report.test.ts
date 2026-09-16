import {
  describe,
  expect,
  it,
} from "vitest";

import {
  escapeHtml,
  renderAdapterReviewHtml,
} from "@/training/review-report";

describe("adapter human review report", () => {
  it("escapes private model output before embedding it in HTML", () => {
    expect(
      escapeHtml('<script>alert("x")</script>'),
    ).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("renders regression-first review controls and local export without external dependencies", () => {
    const html = renderAdapterReviewHtml({
      adapter: "/private/adapter",
      baseModel:
        "Qwen/Qwen3-4B-Instruct-2507",
      benchmarkCaseCount: 1,
      manualReviewQueue: ["physics-case"],
      promotionGate: {
        humanReviewRequired: true,
        mechanicalPassed: false,
        reasons: [
          "mechanical-case-regressions-present",
        ],
      },
      cases: [
        {
          adapter: {
            mechanical: {
              conceptCoverage: 0.5,
              guardrailsPassed: false,
            },
            text: "Adapter <answer>",
          },
          base: {
            mechanical: {
              conceptCoverage: 1,
              guardrailsPassed: true,
            },
            text: "Base answer",
          },
          classification: "regression",
          id: "physics-case",
          mode: "mark",
          prompt: [
            {
              content: "Private <question>",
              role: "user",
            },
          ],
          reviewPriority: "high",
          subject: "physics",
        },
      ],
    });

    expect(html).toContain("physics-case");
    expect(html).toContain("Base better");
    expect(html).toContain("Adapter better");
    expect(html).toContain("IB relevance");
    expect(html).toContain(
      "adapter-human-review.json",
    );
    expect(html).toContain(
      "Private &lt;question&gt;",
    );
    expect(html).not.toContain(
      "Private <question>",
    );
    expect(html).not.toContain(
      "<script>alert",
    );
    expect(html).not.toContain(
      "https://",
    );
  });
});
