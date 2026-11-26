import { describe, expect, it, vi } from "vitest";

import {
  createChatPostHandler,
} from "@/app/api/chat/route";

function markRequest() {
  return new Request("http://localhost/api/chat", {
    body: JSON.stringify({
      filters: {
        pastPaperQuestionId:
          "physics-m25-hl-tz2-p2-qp-q4",
      },
      message: "My answer is 12 J.",
      mode: "mark",
      subject: "physics",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

describe("server mark footer safety", () => {
  it("strips a numeric MARK footer for a real paper without a paired official markscheme", async () => {
    const handler = createChatPostHandler({
      generateTutorAnswer: async () => ({
        model: "test-model",
        text:
          "Your method has the right idea, but an official numeric score is unavailable.\nMARK: 2/3",
      }),
      retrieveStudyContext: async () => [
        {
          documentType: "question-paper",
          id: "physics-m25-hl-tz2-p2-qp-q4",
          locator: "May 2025 · TZ2 · HL · P2 · Q4",
          marks: 3,
          markschemeAvailable: false,
          pairingStatus: "question_only" as const,
          paper: "p2",
          questionNumber: "4",
          subject: "physics" as const,
          text: "Question:\nCalculate the energy transferred. [3]",
          title: "Physics May 2025 HL Paper 2",
          topicIds: ["physics.b.thermal-energy-transfers"],
          year: 2025,
        },
      ],
    });

    const response = await handler(markRequest());
    const body = (await response.json()) as {
      answer: string;
    };

    expect(response.status).toBe(200);
    expect(body.answer).toContain(
      "official numeric score is unavailable",
    );
    expect(body.answer).not.toContain("MARK:");
  });

  it("preserves a matching MARK footer for a paired real paper with its official markscheme", async () => {
    const handler = createChatPostHandler({
      generateTutorAnswer: async () => ({
        model: "test-model",
        text:
          "You earned two of the three available marks.\nMARK: 2/3",
      }),
      retrieveStudyContext: async () => [
        {
          documentType: "question-paper",
          id: "physics-m25-hl-tz2-p2-qp-q4",
          locator: "May 2025 · TZ2 · HL · P2 · Q4",
          marks: 3,
          markschemeAvailable: true,
          pairingStatus: "paired" as const,
          paper: "p2",
          questionNumber: "4",
          subject: "physics" as const,
          text:
            "Question:\nCalculate the energy transferred. [3]\n\nOfficial markscheme:\nAward marks for the correct method and answer.",
          title: "Physics May 2025 HL Paper 2",
          topicIds: ["physics.b.thermal-energy-transfers"],
          year: 2025,
        },
      ],
    });

    const response = await handler(markRequest());
    const body = (await response.json()) as {
      answer: string;
    };

    expect(response.status).toBe(200);
    expect(body.answer).toContain("MARK: 2/3");
  });
  it("refuses to mark a different retrieved question or a visual-dependent pinned question", async () => {
    const generateTutorAnswer = vi.fn(async () => ({ model: "unexpected", text: "MARK: 2/3" }));
    const source = {
      documentType: "question-paper", id: "physics-m25-hl-tz2-p2-qp-q4",
      subject: "physics" as const, title: "Synthetic paper", text: "Synthetic question",
      marks: 3, markschemeAvailable: true, pairingStatus: "paired" as const,
    };
    for (const candidate of [
      { ...source, id: "different-question" },
      { ...source, visualContextRequired: true },
      { ...source, subject: "chemistry" as const },
    ]) {
      const handler = createChatPostHandler({
        generateTutorAnswer,
        retrieveStudyContext: async () => [candidate],
      });
      const response = await handler(markRequest());
      const body = await response.json();
      expect(body.model).toBe("retrieval-only");
      expect(body.sources).toEqual([]);
    }
    expect(generateTutorAnswer).not.toHaveBeenCalled();
  });

  it("only sends the pinned question to the model when retrieval contains extra results", async () => {
    let capturedSystem = "";
    const handler = createChatPostHandler({
      generateTutorAnswer: async ({ system }) => {
        capturedSystem = system;
        return { model: "test", text: "Feedback\nMARK: 2/3" };
      },
      retrieveStudyContext: async () => [
        { id: "different", title: "Other", documentType: "question-paper", subject: "physics", text: "unrelated private fixture" },
        {
          id: "physics-m25-hl-tz2-p2-qp-q4", title: "Pinned", documentType: "question-paper",
          subject: "physics", text: "selected synthetic question", pairingStatus: "paired",
          markschemeAvailable: true, marks: 3,
        },
      ],
    });
    const response = await handler(markRequest());
    const body = await response.json();
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].id).toBe("physics-m25-hl-tz2-p2-qp-q4");
    expect(capturedSystem).toContain("selected synthetic question");
    expect(capturedSystem).not.toContain("unrelated private fixture");
    expect(body.answer).toContain("MARK: 2/3");
  });

});
