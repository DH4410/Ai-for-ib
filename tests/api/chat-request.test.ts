import { describe, expect, it } from "vitest";

import { parseChatRequest } from "@/lib/api/chat-request";

describe("chat request validation", () => {
  it("rejects an unknown subject before retrieval", () => {
    expect(() => parseChatRequest({ mode: "learn", message: "Help", subject: "biology" })).toThrow(
      "subject must be chemistry, physics, or mathematics",
    );
  });

  it("keeps Paper 2 practice constraints structured", () => {
    expect(
      parseChatRequest({
        filters: { paper: "p2", realPastPapersOnly: true, years: [2022, 2025] },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }).filters,
    ).toEqual({ paper: "p2", realPastPapersOnly: true, years: [2022, 2025] });
  });
});
