import { describe, expect, it } from "vitest";

import {
  assessExtractedPage,
  buildSemanticChunks,
} from "@/lib/ingestion/chunks";

function page(pageNumber: number, text: string) {
  return { pageNumber, text };
}

describe("page-aware chunks", () => {
  it("keeps a detected section heading and every original page it spans", () => {
    const chunks = buildSemanticChunks(
      [
        page(43, "B.1 Specific latent heat\nLatent heat changes state without changing temperature."),
        page(44, "Worked example\nCalculate the energy needed for the change of state."),
      ],
      { documentId: "physics-oxford-2023", subject: "physics" },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      headingPath: ["B.1 Specific latent heat"],
      pageEnd: 44,
      pageStart: 43,
    });
  });

  it("starts a new chunk when the next detected section begins", () => {
    const chunks = buildSemanticChunks(
      [
        page(12, "B.1 Specific latent heat\nA state change transfers energy."),
        page(13, "B.2 Specific heat capacity\nTemperature change transfers energy."),
      ],
      { documentId: "physics-oxford-2023", subject: "physics" },
    );

    expect(chunks.map(({ headingPath, pageStart }) => ({ headingPath, pageStart }))).toEqual([
      { headingPath: ["B.1 Specific latent heat"], pageStart: 12 },
      { headingPath: ["B.2 Specific heat capacity"], pageStart: 13 },
    ]);
  });

  it("requires OCR only when extracted text is unusable", () => {
    expect(assessExtractedPage(page(9, ""))).toMatchObject({ extractionMethod: "ocr_required" });
    expect(
      assessExtractedPage(page(10, "Readable selectable textbook text ".repeat(4))),
    ).toMatchObject({ extractionMethod: "text" });
  });

  it("keeps equation references on the page where they occurred", () => {
    const [chunk] = buildSemanticChunks(
      [
        page(30, "B.1 Energy\nE = mc²"),
        page(31, "Worked example\nUse the equation in a calculation."),
      ],
      { documentId: "physics-oxford-2023", subject: "physics" },
    );

    expect(chunk?.equationReferences).toEqual(["p. 30: E = mc²"]);
  });
});
