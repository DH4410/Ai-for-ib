import { describe, expect, it } from "vitest";

import {
  STUDY_EMBEDDING_DIMENSION,
  SupabasePrivateStudyIndexRepository,
  type StudyIndexRpcClient,
} from "@/lib/indexing/repository";

describe("private study indexing repository", () => {
  it("sends private page metadata and chunks through one service-side RPC", async () => {
    let call:
      | { name: string; parameters: Record<string, unknown> }
      | undefined;
    const client: StudyIndexRpcClient = {
      async rpc(name, parameters) {
        call = { name, parameters };
        return {
          data: {
            chunk_count: 1,
            document_id: "document-uuid",
            document_version_id: "version-uuid",
            page_count: 1,
          },
          error: null,
        };
      },
    };
    const repository = new SupabasePrivateStudyIndexRepository(client);

    const result = await repository.replaceSource({
      chunks: [
        {
          documentId: "physics-oxford-2023",
          embedding: Array(STUDY_EMBEDDING_DIMENSION).fill(0.01),
          equationReferences: [],
          figureReferences: [],
          headingPath: ["B.1 Specific latent heat"],
          id: "physics-oxford-2023-a1b2c3d4e5f6-p43-1",
          pageEnd: 43,
          pageStart: 43,
          subject: "physics",
          text: "Owned fixture content.",
          title: "B.1 Specific latent heat",
          topicClassification: {
            method: "heading_rule",
            reason: "Matched the heading.",
          },
          topicConfidence: 0.98,
          topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
        },
      ],
      pages: [
        {
          extractionMethod: "text",
          pageNumber: 43,
          text: "Owned fixture content.",
          textQuality: 1,
        },
      ],
      source: {
        author: null,
        copyrightStatus: "private-licensed",
        documentType: "textbook",
        filename: "physics.pdf",
        id: "physics-oxford-2023",
        publisher: null,
        sourceProvider: "manual",
        sourceReference: "owned-test-fixture",
        subject: "physics",
        title: "Owned fixture",
        usefulForKnowledgeBase: true,
      },
      version: {
        acquiredAt: "2026-09-13T18:00:00.000Z",
        byteCount: 100,
        checksumSha256: "a".repeat(64),
        mimeType: "application/pdf",
        storagePath: "physics/physics-oxford-2023.pdf",
      },
    });

    expect(call?.name).toBe("index_private_study_source");
    expect(call?.parameters).toMatchObject({
      p_document: { source_id: "physics-oxford-2023", subject: "physics" },
      p_version: { checksum_sha256: "a".repeat(64) },
    });
    expect(
      (call?.parameters.p_pages as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("text");
    expect(
      (
        call?.parameters.p_chunks as Array<
          Record<string, unknown>
        >
      )[0]?.topic_ids,
    ).toEqual([
      "physics.b.particulate-matter.specific-latent-heat",
      "physics.b.thermal-energy-transfers",
      "physics.b.particulate-matter",
    ]);
    expect(result).toEqual({
      chunkCount: 1,
      documentId: "document-uuid",
      documentVersionId: "version-uuid",
      pageCount: 1,
    });
  });

  it("rejects vectors that cannot fit the configured pgvector column", async () => {
    const repository = new SupabasePrivateStudyIndexRepository({
      async rpc() {
        throw new Error("RPC should not be called");
      },
    });

    await expect(
      repository.replaceSource({
        chunks: [
          {
            documentId: "physics-oxford-2023",
            embedding: [0.1, 0.2],
            equationReferences: [],
            figureReferences: [],
            headingPath: ["B.1"],
            id: "chunk",
            pageEnd: 1,
            pageStart: 1,
            subject: "physics",
            text: "Owned fixture",
            title: "B.1",
            topicClassification: {
              method: "unclassified",
              reason: "No match.",
            },
            topicConfidence: 0,
            topicIds: [],
          },
        ],
        pages: [],
        source: {
          author: null,
          copyrightStatus: "private-licensed",
          documentType: "textbook",
          filename: "physics.pdf",
          id: "physics-oxford-2023",
          publisher: null,
          sourceProvider: "manual",
          sourceReference: "owned-test-fixture",
          subject: "physics",
          title: "Owned fixture",
          usefulForKnowledgeBase: true,
        },
        version: {
          acquiredAt: "2026-09-13T18:00:00.000Z",
          byteCount: 100,
          checksumSha256: "a".repeat(64),
          mimeType: "application/pdf",
          storagePath: "physics/physics-oxford-2023.pdf",
        },
      }),
    ).rejects.toThrow("exactly 1024");
  });
});
