import { describe, expect, it, vi } from "vitest";

import { createChatPostHandler } from "@/app/api/chat/route";
import { AuthenticationError } from "@/lib/auth/request-user";

describe("chat API route", () => {
  it("returns citations but not private source text from a valid request", async () => {
    let systemPrompt = "";
    const handler = createChatPostHandler({
      generateTutorAnswer: async ({ system }) => {
        systemPrompt = system;
        return {
          model: "test-self-hosted-model",
          text: "A cited explanation.",
        };
      },
      loadLearnerContext: async () =>
        "Particulate matter · 41% mastery · 2 attempts · review due",
      retrieveStudyContext: async () => [
        {
          documentId: "physics-oxford-2023",
          documentType: "textbook",
          id: "physics-b1-p43",
          locator: "Theme B.1 — p. 43",
          pageEnd: 43,
          pageStart: 43,
          subject: "physics",
          text: "Specific latent heat is energy transferred during a state change.",
          title: "Physics Course Companion",
          topicIds: [
            "physics.b.particulate-matter.specific-latent-heat",
          ],
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          message: "Explain specific latent heat",
          mode: "learn",
          subject: "physics",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      sources: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(systemPrompt).toContain(
      "Particulate matter · 41% mastery",
    );
    expect(body.sources).toEqual([
      {
        documentType: "textbook",
        id: "physics-b1-p43",
        locator: "Theme B.1 — p. 43",
        pageEnd: 43,
        pageStart: 43,
        title: "Physics Course Companion",
        topicIds: [
          "physics.b.particulate-matter.specific-latent-heat",
        ],
      },
    ]);
    expect(JSON.stringify(body.sources)).not.toContain(
      "Specific latent heat is energy transferred",
    );
  });

  it("does not call the model when strict real-paper retrieval finds nothing", async () => {
    const generateTutorAnswer = vi.fn(async () => ({
      model: "should-not-run",
      text: "Invented question",
    }));
    const handler = createChatPostHandler({
      generateTutorAnswer,
      retrieveStudyContext: async () => [],
    });

    const response = await handler(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          filters: {
            paper: "p2",
            realPastPapersOnly: true,
            years: [2025],
          },
          message: "Give me a real question",
          mode: "practice",
          subject: "physics",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as {
      answer: string;
      model: string;
      sources: unknown[];
    };

    expect(response.status).toBe(200);
    expect(generateTutorAnswer).not.toHaveBeenCalled();
    expect(body.model).toBe("retrieval-only");
    expect(body.sources).toEqual([]);
    expect(body.answer).toContain("I won't invent one");
  });

  it("returns 401 when an explicitly supplied learner session is invalid", async () => {
    const handler = createChatPostHandler({
      generateTutorAnswer: async () => ({
        model: "never",
        text: "never",
      }),
      loadLearnerContext: async () => {
        throw new AuthenticationError("expired session");
      },
      retrieveStudyContext: async () => [],
    });

    const response = await handler(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({
          message: "Help me revise",
          mode: "revise",
          subject: "chemistry",
        }),
        headers: {
          Authorization: "Bearer expired",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });
});
