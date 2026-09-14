import { describe, expect, it } from "vitest";

import {
  parseMarkSuggestion,
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

  it("ignores impossible or non-final mark strings", () => {
    expect(parseMarkSuggestion("MARK: 3/2")).toBeNull();
    expect(
      parseMarkSuggestion(
        "MARK: 1/2\nContinue explaining afterwards.",
      ),
    ).toBeNull();
  });
});
