import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RPC_NAMES = [
  "search_private_study_chunks",
  "search_private_study_chunks_vector",
  "index_private_study_source",
  "search_private_past_paper_questions",
  "get_private_past_paper_question",
  "record_private_learning_attempt",
  "get_private_learning_progress",
  "index_private_past_paper",
  "list_private_study_sources",
] as const;

async function migration(): Promise<string> {
  return readFile(
    resolve(
      process.cwd(),
      "supabase",
      "migrations",
      "20260913000000_private_study_foundation.sql",
    ),
    "utf8",
  );
}

describe("Supabase migration integrity", () => {
  it("uses valid double-dollar function bodies", async () => {
    const sql = await migration();

    expect(sql).not.toMatch(/^as \$$/m);
    expect(sql).not.toMatch(/^\$;$/m);

    const functionCount = (
      sql.match(/create or replace function public\./g) ?? []
    ).length;
    const bodyCount = (sql.match(/\nas \$\$\n/g) ?? []).length;

    expect(bodyCount).toBe(functionCount);
  });

  it("keeps level, session and timezone filtering in the private past-paper RPC contract", async () => {
    const sql = await migration();

    expect(sql).toContain("p_level text default null");
    expect(sql).toContain(
      "or upper(question.level) = upper(p_level)",
    );
    expect(sql).toContain("p_session text default null");
    expect(sql).toContain(
      "or lower(question.session) = lower(p_session)",
    );
    expect(sql).toContain("p_timezone text default null");
    expect(sql).toContain(
      "or upper(question.timezone) = upper(p_timezone)",
    );
    expect(sql).toContain(
      "text, text, integer[], text, text, text, text, text[], boolean, integer",
    );
  });

  it("returns full paper identity fields for exact-question marking", async () => {
    const sql = await migration();
    const exactQuestion = sql.slice(
      sql.indexOf(
        "create or replace function public.get_private_past_paper_question",
      ),
      sql.indexOf(
        "create or replace function public.record_private_learning_attempt",
      ),
    );

    expect(exactQuestion).toContain("level text");
    expect(exactQuestion).toContain("session text");
    expect(exactQuestion).toContain("timezone text");
    expect(exactQuestion).toContain("question.level");
    expect(exactQuestion).toContain("question.session");
    expect(exactQuestion).toContain("question.timezone");
  });

  it("exposes safe paired-question counts without markscheme text in the source catalog", async () => {
    const sql = await migration();

    expect(sql).toContain(
      "paired_question_count integer",
    );
    expect(sql).toContain(
      "question.pairing_status = 'paired'",
    );
  });

  it("keeps SECURITY DEFINER search paths out of public", async () => {
    const sql = await migration();

    expect(sql).not.toContain(
      "set search_path = private, public",
    );
    expect(sql).not.toContain(
      "set search_path = pg_catalog, private, public",
    );
  });

  it("revokes every private RPC from browser roles and grants only the server role", async () => {
    const sql = await migration();
    const hardening = sql.slice(
      sql.indexOf("-- Final RPC privilege hardening"),
    );

    expect(hardening.length).toBeGreaterThan(0);

    for (const name of RPC_NAMES) {
      expect(hardening).toContain(
        `revoke all on function public.${name}(`,
      );
      expect(hardening).toContain(
        "from public, anon, authenticated;",
      );
      expect(hardening).toContain(
        `grant execute on function public.${name}(`,
      );
      expect(hardening).toContain("to service_role;");
    }
  });
});
