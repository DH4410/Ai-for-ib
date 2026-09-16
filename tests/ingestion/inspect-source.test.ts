import {
  readFile,
} from "node:fs/promises";

import {
  describe,
  expect,
  it,
} from "vitest";

describe("safe source inspection", () => {
  it("never contains code paths that print chunk or page text", async () => {
    const script = await readFile(
      "scripts/inspect-source.ts",
      "utf8",
    );

    expect(script).toContain(
      "unclassifiedPageRanges",
    );
    expect(script).toContain(
      "topicCounts",
    );
    expect(script).not.toContain(
      "console.log(chunk.text",
    );
    expect(script).not.toContain(
      "console.log(page.text",
    );
    expect(script).not.toContain(
      "questionText",
    );
  });
});
