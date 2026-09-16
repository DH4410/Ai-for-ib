import {
  describe,
  expect,
  it,
} from "vitest";

import {
  applyOcrReplacements,
  parseOcrReplacements,
} from "@/lib/ingestion/ocr";

describe("OCR page replacement", () => {
  it("only promotes strong OCR text for pages previously requiring OCR", () => {
    const pages = [
      {
        extractionMethod:
          "text" as const,
        pageNumber: 1,
        text:
          "Trusted page text. ".repeat(
            10,
          ),
        textQuality: 1,
      },
      {
        extractionMethod:
          "ocr_required" as const,
        pageNumber: 2,
        text: "x",
        textQuality: 1,
      },
    ];

    const updated = applyOcrReplacements(
      pages,
      [
        {
          pageNumber: 2,
          text:
            "B.1 Thermal energy transfers\n" +
            "Readable OCR replacement text about thermal energy. ".repeat(
              5,
            ),
        },
      ],
    );

    expect(updated[1]).toMatchObject({
      extractionMethod: "ocr",
      pageNumber: 2,
    });
    expect(updated[1]?.text).toContain(
      "Thermal energy",
    );
  });

  it("rejects weak OCR, non-OCR targets and duplicate page numbers", () => {
    const pages = [
      {
        extractionMethod:
          "ocr_required" as const,
        pageNumber: 1,
        text: "",
        textQuality: 0,
      },
      {
        extractionMethod:
          "text" as const,
        pageNumber: 2,
        text:
          "Trusted page text. ".repeat(
            10,
          ),
        textQuality: 1,
      },
    ];

    expect(() =>
      applyOcrReplacements(pages, [
        {
          pageNumber: 1,
          text: "too short",
        },
      ]),
    ).toThrow(
      "still too weak to trust",
    );

    expect(() =>
      applyOcrReplacements(pages, [
        {
          pageNumber: 2,
          text:
            "Long replacement text. ".repeat(
              10,
            ),
        },
      ]),
    ).toThrow(
      "only allowed for ocr_required",
    );

    expect(() =>
      parseOcrReplacements({
        pages: [
          {
            pageNumber: 1,
            text: "first",
          },
          {
            pageNumber: 1,
            text: "duplicate",
          },
        ],
      }),
    ).toThrow(
      "duplicate OCR page number",
    );
  });
});
