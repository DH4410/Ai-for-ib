import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Colab training requirements", () => {
  it("pins the fast-moving training libraries but leaves CUDA-matched torch to Colab", async () => {
    const contents = await readFile(
      "training/requirements-colab.txt",
      "utf8",
    );

    for (const packageName of [
      "transformers",
      "datasets",
      "trl",
      "peft",
      "accelerate",
      "bitsandbytes",
    ]) {
      expect(contents).toMatch(
        new RegExp(
          `^${packageName.replace("-", "\\-")}==[^\\s]+`,
          "m",
        ),
      );
    }

    expect(contents).not.toMatch(/^torch==/m);
  });
});
