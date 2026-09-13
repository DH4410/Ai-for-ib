import { describe, expect, it } from "vitest";

import { findPrivateBoundaryViolations } from "@/lib/security/private-boundary";

describe("private study boundary", () => {
  it("rejects raw and derived licensed source paths", () => {
    expect(
      findPrivateBoundaryViolations([
        "private-sources/physics/book.pdf",
        "private-index/extracted/book.json",
        "data/source-manifest.jsonl",
      ]),
    ).toEqual([
      "private-sources/physics/book.pdf",
      "private-index/extracted/book.json",
      "data/source-manifest.jsonl",
    ]);
  });

  it("allows code, documentation, and the empty manifest example", () => {
    expect(
      findPrivateBoundaryViolations([
        "lib/retrieval.ts",
        "docs/INGESTION.md",
        "data/source-manifest.example.jsonl",
      ]),
    ).toEqual([]);
  });

  it("rejects a source binary or dotenv file even outside the private folders", () => {
    expect(
      findPrivateBoundaryViolations([
        "uploads/chemistry.PDF",
        ".env.production",
        "models/tutor.gguf",
      ]),
    ).toEqual([
      "uploads/chemistry.PDF",
      ".env.production",
      "models/tutor.gguf",
    ]);
  });
});
