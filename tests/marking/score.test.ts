import { describe, expect, it } from "vitest";

import {
  parseMarkSuggestion,
  recordableMarkSuggestion,
  stripMarkSuggestion,
} from "@/lib/marking/score";

describe("marker score footer", () => {
  it("parses a valid final mark without changing the explanation", () => {
    const text =
      "You earned the method mark but lost the unit mark.\nMARK: 1/2";

    expect(parseMarkSuggestion(text)).toEqual({
      maximumMarks: 2,
      score: 1,
    });
    expect(stripMarkSuggestion(text)).toBe(
      "You earned the method mark but lost the unit mark.",
    );
  });

  it("only makes an official paper mark recordable when the paired scheme and total match", () => {
    const pairedSource = {
      documentType: "question-paper" as const,
      id: "physics-m25-p2-q4",
      marks: 2,
      pairingStatus: "paired" as const,
      title: "Physics May 2025 HL Paper 2",
    };

    expect(
      recordableMarkSuggestion(
        "Feedback\nMARK: 1/2",
        pairedSource,
      ),
    ).toEqual({
      maximumMarks: 2,
      score: 1,
    });

    expect(
      recordableMarkSuggestion(
        "Feedback\nMARK: 1/2",
        {
          ...pairedSource,
          pairingStatus: "question_only",
        },
      ),
    ).toBeNull();

    expect(
      recordableMarkSuggestion(
        "Feedback\nMARK: 1/3",
        pairedSource,
      ),
    ).toBeNull();
  });

  it("ignores impossible or non-final mark strings", () => {
    expect(parseMarkSuggestion("MARK: 3/2")).toBeNull();
    expect(
      parseMarkSuggestion(
        "MARK: 1/2\nContinue explaining afterwards.",
      ),
    ).toBeNull();
  });
});
