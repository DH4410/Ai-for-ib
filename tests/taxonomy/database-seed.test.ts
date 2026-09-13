import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { IBDP_TOPICS } from "@/lib/taxonomy/ibdp";

describe("IB taxonomy database seed", () => {
  it("contains every application topic id and syllabus version", async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        "supabase",
        "migrations",
        "20260913000000_private_study_foundation.sql",
      ),
      "utf8",
    );

    for (const topic of IBDP_TOPICS) {
      expect(migration).toContain(
        `('${topic.id}', '${topic.subject}'`,
      );
      expect(migration).toContain(
        `'${topic.label.replaceAll("'", "''")}', '${topic.syllabusVersion}', null)`,
      );
    }
  });

  it("keeps topic ids unique", () => {
    const ids = IBDP_TOPICS.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
