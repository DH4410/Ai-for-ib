import type { RankedSourceChunk } from "@/lib/retrieval/repository";
import type { Subject } from "@/types/study";

const RECIPROCAL_RANK_OFFSET = 60;

export type HybridRankings = {
  lexical: RankedSourceChunk[];
  vector: RankedSourceChunk[];
  subject: Subject;
  limit: number;
};

export function formatSourceLocator(chunk: Pick<RankedSourceChunk, "locator" | "pageStart" | "title">): string {
  const locator = chunk.locator || (chunk.pageStart ? `p. ${chunk.pageStart}` : "Source locator unavailable");

  return `${chunk.title} — ${locator}`;
}

export function fuseRankings({ lexical, vector, subject, limit }: HybridRankings): RankedSourceChunk[] {
  const merged = new Map<string, RankedSourceChunk>();

  for (const ranking of [lexical, vector]) {
    ranking
      .filter((chunk) => chunk.subject === subject)
      .forEach((chunk, index) => {
        const existing = merged.get(chunk.id);
        const reciprocalRankScore = 1 / (RECIPROCAL_RANK_OFFSET + index + 1);
        merged.set(chunk.id, {
          ...chunk,
          score: (existing?.score ?? 0) + reciprocalRankScore,
        });
      });
  }

  return [...merged.values()]
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(limit, 20)));
}
