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
      retrievedContext:
        "No private source passages were retrieved for this question.",
      subject: "physics",
    });

    expect(prompt).toContain(
      "Never invent, paraphrase, or label a generated question as a real IB past-paper question.",
    );
  });

  it("uses mastery only as a personalization hint", () => {
    const prompt = buildSystemPrompt({
      learnerContext:
        "Functions · 42% mastery · 3 attempts · review due",
      mode: "revise",
      retrievedContext: "Owned fixture.",
      subject: "mathematics",
    });

    expect(prompt).toContain(
      "Private learner context:\nFunctions · 42% mastery",
    );
    expect(prompt).toContain(
      "must never override source evidence, official marking criteria",
    );
    expect(prompt).toContain(
      "Do not repeatedly announce mastery percentages",
    );
  });

  it("honours explanation depth and hints-first preferences", () => {
    const prompt = buildSystemPrompt({
      explanationLevel: "simple",
      hintsFirst: true,
      mode: "practice",
      retrievedContext: "Owned fixture.",
      subject: "physics",
    });

    expect(prompt).toContain("Explanation level: simple");
    expect(prompt).toContain("Use short sentences, small conceptual steps");
    expect(prompt).toContain("Hints-first is enabled");
    expect(prompt).toContain("one useful next hint or question at a time");
  });
});
