import type { SourceChunk } from "@/types/study";

function questionBody(source: SourceChunk): string {
  const prefix = "Question:\n";

  return source.text.startsWith(prefix)
    ? source.text.slice(prefix.length).trim()
    : source.text.trim();
}

export function formatRealPastPaperPractice(
  sources: SourceChunk[],
): string {
  return sources
    .map((source, index) => {
      const heading =
        source.locator?.trim() ||
        `Real past-paper question ${index + 1}`;

      return `${heading}\n\n${questionBody(source)}`;
    })
    .join("\n\n---\n\n");
}
