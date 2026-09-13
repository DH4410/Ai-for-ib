import { describe, expect, it } from "vitest";

import { createChatPostHandler } from "@/app/api/chat/route";

describe("chat API route", () => {
  it("returns citations but not private source text from a valid request", async () => {
    const handler = createChatPostHandler({
      generateTutorAnswer: async () => ({ model: "test-self-hosted-model", text: "A cited explanation." }),
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
          topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: "Explain specific latent heat", mode: "learn", subject: "physics" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const body = (await response.json()) as { sources: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(body.sources).toEqual([
      {
        documentType: "textbook",
        id: "physics-b1-p43",
        locator: "Theme B.1 — p. 43",
        pageEnd: 43,
        pageStart: 43,
        title: "Physics Course Companion",
        topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
      },
    ]);
    expect(JSON.stringify(body.sources)).not.toContain("Specific latent heat is energy transferred");
  });
});
