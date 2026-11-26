import { describe, expect, it } from "vitest";

import { parsePaperMetadata, parsePaperReviewHints } from "@/lib/past-papers/metadata";
import { pairPapersAndMarkschemes } from "@/lib/past-papers/pairing";

const chemistryTz2Paper2 = {
  documentKind: "question-paper" as const,
  id: "chem-m25-tz2-p2-qp",
  language: "English",
  level: "HL" as const,
  paper: "p2",
  session: "may" as const,
  subject: "chemistry" as const,
  syllabusVersion: "2025",
  timezone: "TZ2",
  year: 2025,
};

const chemistryTz2Paper2Markscheme = {
  ...chemistryTz2Paper2,
  documentKind: "markscheme" as const,
  id: "chem-m25-tz2-p2-ms",
};

describe("past-paper metadata and pairing", () => {
  it("normalizes an unambiguous filename without inventing missing fields", () => {
    expect(parsePaperMetadata("physics_hl_paper_2_tz2_markscheme_m25.pdf")).toEqual({
      documentKind: "markscheme",
      level: "HL",
      paper: "p2",
      session: "may",
      subject: "physics",
      timezone: "TZ2",
      year: 2025,
    });
  });

  it("pairs a uniquely matching M25 English Chemistry HL TZ2 Paper 2 markscheme", () => {
    expect(
      pairPapersAndMarkschemes([chemistryTz2Paper2], [chemistryTz2Paper2Markscheme]),
    ).toEqual([
      {
        markschemeDocumentId: "chem-m25-tz2-p2-ms",
        pairingStatus: "paired",
        questionDocumentId: "chem-m25-tz2-p2-qp",
      },
    ]);
  });

  it("marks duplicate candidate markschemes ambiguous instead of guessing", () => {
    expect(
      pairPapersAndMarkschemes(
        [chemistryTz2Paper2],
        [chemistryTz2Paper2Markscheme, { ...chemistryTz2Paper2Markscheme, id: "duplicate-ms" }],
      ),
    ).toEqual([
      {
        candidateMarkschemeDocumentIds: ["chem-m25-tz2-p2-ms", "duplicate-ms"],
        pairingStatus: "ambiguous",
        questionDocumentId: "chem-m25-tz2-p2-qp",
      },
    ]);
  });

  it("keeps a 2026 visible question paper without a matching scheme question_only", () => {
    expect(
      pairPapersAndMarkschemes([{ ...chemistryTz2Paper2, id: "physics-m26-tza-p1a", subject: "physics", year: 2026 }], []),
    ).toEqual([
      {
        pairingStatus: "question_only",
        questionDocumentId: "physics-m26-tza-p1a",
      },
    ]);
  });
  it("does not treat standalone copy numbers or dates as a paper component", () => {
    expect(parsePaperMetadata("physics_m25_hl_tz2_qp_copy_2.pdf").paper).toBeUndefined();
    expect(parsePaperMetadata("physics_m25_hl_tz2_p1b_qp.pdf").paper).toBe("p1b");
  });

  it("leaves contradictory filename metadata unresolved", () => {
    const hints = parsePaperMetadata("physics_chemistry_m25_n26_hl_sl_tz1_tz2_p1_p2_qp_ms.pdf");
    for (const field of ["subject", "year", "session", "level", "timezone", "paper", "documentKind"] as const) {
      expect(hints[field]).toBeUndefined();
    }
  });

  it("recognizes explicit math course and language without assuming either", () => {
    expect(parsePaperReviewHints("Mathematics_Analysis_and_Approaches_HL_English.pdf")).toMatchObject({
      mathematicsCourse: "AA", language: "English",
    });
    expect(parsePaperReviewHints("Math_AI_SL_Spanish.pdf")).toMatchObject({
      mathematicsCourse: "AI", language: "Spanish",
    });
    expect(parsePaperReviewHints("Math_HL.pdf").mathematicsCourse).toBeUndefined();
  });

});
