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
        filters: {
          paper: "p2",
          questionCount: 3,
          realPastPapersOnly: true,
          years: [2022, 2025],
        },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }).filters,
    ).toEqual({
      paper: "p2",
      questionCount: 3,
      realPastPapersOnly: true,
      years: [2022, 2025],
    });
  });

  it("keeps an exact real-paper question id for marking continuity", () => {
    expect(
      parseChatRequest({
        filters: {
          pastPaperQuestionId: "physics-m25-hl-tz2-p2-qp-q4a",
        },
        message: "My answer is 4200 J.",
        mode: "mark",
        subject: "physics",
      }).filters,
    ).toMatchObject({
      pastPaperQuestionId:
        "physics-m25-hl-tz2-p2-qp-q4a",
    });
  });

  it("rejects malformed exact paper identifiers", () => {
    expect(() =>
      parseChatRequest({
        filters: {
          pastPaperQuestionId: "../../private/question",
        },
        message: "Mark this",
        mode: "mark",
        subject: "physics",
      }),
    ).toThrow(
      "filters.pastPaperQuestionId must be a valid question identifier",
    );
  });

  it("rejects unsupported real-paper batch sizes", () => {
    expect(() =>
      parseChatRequest({
        filters: {
          questionCount: 8,
          realPastPapersOnly: true,
        },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }),
    ).toThrow(
      "filters.questionCount must be 1, 3, or 5",
    );
  });
});
