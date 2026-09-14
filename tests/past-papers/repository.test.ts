import { describe, expect, it } from "vitest";

import {
  SupabasePastPaperIndexRepository,
} from "@/lib/past-papers/repository";

describe("past-paper index repository", () => {
  it("sends question and markscheme records through one atomic RPC", async () => {
    let called:
      | { name: string; parameters: Record<string, unknown> }
      | undefined;

    const repository =
      new SupabasePastPaperIndexRepository({
        async rpc(name: string, parameters: Record<string, unknown>) {
          called = { name, parameters };
          return {
            data: {
              markscheme_document_id: "ms-uuid",
              paired_question_count: 1,
              question_count: 1,
              question_document_id: "qp-uuid",
            },
            error: null,
          };
        },
      });

    const sourceBase = {
      author: null,
      copyrightStatus: "private-licensed" as const,
      publisher: null,
      sourceProvider: "manual" as const,
      sourceReference: "local-authorized",
      subject: "physics" as const,
      usefulForKnowledgeBase: true,
    };
    const metadataBase = {
      language: "English",
      level: "HL" as const,
      paper: "p2",
      session: "may" as const,
      subject: "physics" as const,
      syllabusVersion: "2025",
      timezone: "TZ2",
      year: 2025,
    };

    const result = await repository.replacePaper({
      markschemeDocument: {
        ...metadataBase,
        documentKind: "markscheme",
        id: "physics-m25-hl-tz2-p2-ms",
      },
      markschemeSource: {
        ...sourceBase,
        documentType: "markscheme",
        filename: "markscheme.pdf",
        id: "physics-m25-hl-tz2-p2-ms",
        title: "Physics May 2025 HL P2 markscheme",
      },
      markschemeVersion: {
        acquiredAt: "2026-09-13T19:00:00.000Z",
        byteCount: 50,
        checksumSha256: "b".repeat(64),
        mimeType: "application/pdf",
        storagePath:
          "physics/physics-m25-hl-tz2-p2-ms.pdf",
      },
      questionDocument: {
        ...metadataBase,
        documentKind: "question-paper",
        id: "physics-m25-hl-tz2-p2-qp",
      },
      questionSource: {
        ...sourceBase,
        documentType: "question-paper",
        filename: "question.pdf",
        id: "physics-m25-hl-tz2-p2-qp",
        title: "Physics May 2025 HL P2",
      },
      questionVersion: {
        acquiredAt: "2026-09-13T19:00:00.000Z",
        byteCount: 100,
        checksumSha256: "a".repeat(64),
        mimeType: "application/pdf",
        storagePath:
          "physics/physics-m25-hl-tz2-p2-qp.pdf",
      },
      questions: [
        {
          assetReferences: [],
          commandTerms: ["calculate"],
          id: "physics-m25-hl-tz2-p2-qp-q1",
          level: "HL",
          marks: 2,
          markschemeText: "Award 2 marks.",
          pairingStatus: "paired",
          paper: "p2",
          questionNumber: "1",
          questionText: "Calculate the value. [2]",
          session: "may",
          subject: "physics",
          syllabusVersion: "2025",
          timezone: "TZ2",
          topicClassificationMethod: "unclassified",
          topicConfidence: 0,
          topicIds: [
            "physics.b.particulate-matter.specific-latent-heat",
          ],
          year: 2025,
        },
      ],
    });

    expect(called?.name).toBe(
      "index_private_past_paper",
    );
    expect(
      (
        called?.parameters.p_questions as Array<
          Record<string, unknown>
        >
      )[0]?.topic_ids,
    ).toEqual([
      "physics.b.particulate-matter.specific-latent-heat",
      "physics.b.thermal-energy-transfers",
      "physics.b.particulate-matter",
    ]);
    expect(result).toEqual({
      markschemeDocumentId: "ms-uuid",
      pairedQuestionCount: 1,
      questionCount: 1,
      questionDocumentId: "qp-uuid",
    });
  });
});
