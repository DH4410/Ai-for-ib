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
          level: "hl",
          paper: "p2",
          questionCount: 3,
          requireMarkscheme: true,
          session: "May",
          timezone: "tz2",
          realPastPapersOnly: true,
          years: [2022, 2025],
        },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }).filters,
    ).toEqual({
      level: "HL",
      paper: "p2",
      questionCount: 3,
      requireMarkscheme: true,
      session: "may",
      timezone: "TZ2",
      realPastPapersOnly: true,
      years: [2022, 2025],
    });
  });

  it("rejects unsupported IB levels", () => {
    expect(() =>
      parseChatRequest({
        filters: { level: "higher" },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }),
    ).toThrow("filters.level must be HL or SL");
  });

  it("rejects unsupported past-paper session and timezone filters", () => {
    expect(() =>
      parseChatRequest({
        filters: { session: "winter" },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }),
    ).toThrow(
      "filters.session must be may or november",
    );

    expect(() =>
      parseChatRequest({
        filters: { timezone: "Europe/Amsterdam" },
        message: "Give questions",
        mode: "practice",
        subject: "physics",
      }),
    ).toThrow(
      "filters.timezone must look like TZ0, TZ1, TZ2, TZ3, TZA, TZB, or TZC",
    );
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
  it("accepts legacy paper years and lettered or zero timezones", () => {
    for (const timezone of ["tz0", "tzA", "TZB", "tzC"]) {
      expect(parseChatRequest({
        subject: "physics", mode: "practice", message: "Find a paper",
        filters: { years: [2000, 2017, 2026], timezone, paper: "p1", realPastPapersOnly: true },
      }).filters).toMatchObject({ years: [2000, 2017, 2026], timezone: timezone.toUpperCase(), paper: "p1" });
    }
    for (const year of [1999, 2101]) {
      expect(() => parseChatRequest({
        subject: "physics", mode: "practice", message: "Find a paper", filters: { years: [year] },
      })).toThrow("between 2000 and 2100");
    }
  });

});
