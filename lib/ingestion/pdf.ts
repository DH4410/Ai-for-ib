import { readFile } from "node:fs/promises";

import type { ExtractedPageInput } from "@/lib/ingestion/types";

type PdfTextItem = {
  hasEOL: boolean;
  str: string;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "hasEOL" in item &&
    typeof item.hasEOL === "boolean"
  );
}

function combineTextItems(items: unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isPdfTextItem(item)) {
      continue;
    }

    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }

  return text.replace(/\s+\n/g, "\n").replace(/ {2,}/g, " ").trim();
}

/**
 * Extracts selectable text from each PDF page without rendering, OCR, or
 * network access. Callers decide whether an extracted page needs OCR later.
 */
export async function extractPdfPages(pdfPath: string): Promise<ExtractedPageInput[]> {
  const bytes = await readFile(pdfPath);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    const pages: ExtractedPageInput[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push({
        pageNumber,
        text: combineTextItems(textContent.items),
      });
    }

    return pages;
  } finally {
    await document.cleanup();
    await loadingTask.destroy();
  }
}
