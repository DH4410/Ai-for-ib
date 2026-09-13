import type { SourceChunk, Subject } from "@/types/study";

/**
 * Retrieval boundary for the private IB knowledge base.
 *
 * V1 deliberately returns no licensed material. The next milestone will replace
 * this with hybrid retrieval (metadata filters + embeddings/full-text search)
 * over privately stored textbooks, syllabus documents, notes, papers and
 * markschemes.
 */
export async function retrieveStudyContext(args: {
  subject: Subject;
  query: string;
  limit?: number;
}): Promise<SourceChunk[]> {
  void args;
  return [];
}

export function formatRetrievedContext(chunks: SourceChunk[]): string {
  if (chunks.length === 0) {
    return "No private source passages were retrieved for this question.";
  }

  return chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}] ${chunk.title}${chunk.locator ? ` — ${chunk.locator}` : ""}\n${chunk.text}`,
    )
    .join("\n\n");
}
