import { describe, expect, it } from "vitest";

import {
  createChatPostHandler,
} from "@/app/api/chat/route";

describe("past-paper citation identity", () => {
  it("keeps level, session and timezone in browser-safe citation metadata", async () => {
    const handler = createChatPostHandler({
      generateTutorAnswer: async () => ({
        model: "should-not-run",
        text: "should-not-run",
      }),
      retrieveStudyContext: async () => [
        {
          documentType: "question-paper",
          id: "physics-m25-hl-tz2-p2-qp-q4",
          level: "HL" as const,
          locator: "May 2025 · TZ2 · HL · P2 · Q4",
          marks: 3,
          markschemeAvailable: true,
          pairingStatus: "paired" as const,
          paper: "p2",
          pageEnd: 7,
          pageStart: 6,
          questionNumber: "4",
          session: "may" as const,
          subject: "physics" as const,
          text: "Question:\nCalculate the energy transferred. [3]",
          timezone: "TZ2",
          title: "Physics May 2025 HL Paper 2",
          topicIds: ["physics.b.thermal-energy-transfers"],
          year: 2025,
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          filters: {
            level: "HL",
            paper: "p2",
            realPastPapersOnly: true,
            session: "may",
            timezone: "TZ2",
            years: [2025],
          },
          message: "Give me one real question",
          mode: "practice",
          subject: "physics",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      sources: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.sources[0]).toMatchObject({
      level: "HL",
      session: "may",
      timezone: "TZ2",
      year: 2025,
      paper: "p2",
      questionNumber: "4",
      pageStart: 6,
      pageEnd: 7,
    });
  });
});
