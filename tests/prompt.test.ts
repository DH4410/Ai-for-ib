import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "@/lib/prompt";
import { formatRetrievedContext } from "@/lib/retrieval";

describe("retrieved-source prompting", () => {
  it("requires claims from private context to cite the supplied source locator", () => {
    const prompt = buildSystemPrompt({
      mode: "learn",
      retrievedContext: formatRetrievedContext([
        {
          id: "physics-b1-p43",
          locator: "Theme B.1 — p. 43",
          text: "Owned fixture passage.",
          title: "Physics Course Companion",
        },
      ]),
      subject: "physics",
    });

    expect(prompt).toContain(
      "Cite retrieved sources using their supplied title and locator.",
    );
    expect(prompt).toContain(
      "Physics Course Companion — Theme B.1 — p. 43",
    );
  });

  it("forbids invented real past-paper questions when strict paper mode is requested", () => {
    const prompt = buildSystemPrompt({
      mode: "practice",
      realPastPapersOnly: true,
      retrievedContext: "No private source passages were retrieved for this question.",
      subject: "physics",
    });

    expect(prompt).toContain(
      "Never invent, paraphrase, or label a generated question as a real IB past-paper question.",
    );
  });
});
