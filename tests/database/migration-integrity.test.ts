import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RPC_NAMES = [
  "search_private_study_chunks",
  "search_private_study_chunks_vector",
  "index_private_study_source",
  "search_private_past_paper_questions",
  "get_private_past_paper_question",
  "get_private_past_paper_asset",
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

  it("requires every requested textbook topic at trusted confidence", async () => {
    const sql = await migration();
    const lexical = sql.slice(
      sql.indexOf(
        "create or replace function public.search_private_study_chunks(",
      ),
      sql.indexOf(
        "create or replace function public.search_private_study_chunks_vector(",
      ),
    );
    const vector = sql.slice(
      sql.indexOf(
        "create or replace function public.search_private_study_chunks_vector(",
      ),
      sql.indexOf(
        "-- Seed the public-label IB taxonomy",
      ),
    );

    expect(lexical).toContain(
      "cardinality(p_topic_ids) > 0",
    );
    expect(lexical).toContain(
      "or chunk.search_vector @@",
    );

    for (const body of [lexical, vector]) {
      expect(body).toContain(
        "from unnest(p_topic_ids) requested(topic_id)",
      );
      expect(body).toContain(
        "required_topic.topic_id = requested.topic_id",
      );
      expect(body).toContain(
        "required_topic.confidence >= 0.8",
      );
      expect(body).not.toContain(
        "required_topic.topic_id = any(p_topic_ids)",
      );
    }
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

  it("requires actual markscheme text for paired paper records", async () => {
    const sql = await migration();
    const paperIndexFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.index_private_past_paper",
      ),
      sql.indexOf(
        "create or replace function public.list_private_study_sources",
      ),
    );

    expect(sql).toContain(
      "pairing_status <> 'paired'",
    );
    expect(sql).toContain(
      "or markscheme_text is not null",
    );
    expect(paperIndexFunction).toContain(
      "paired questions require non-empty markscheme text",
    );
  });

  it("binds recorded past-paper attempts to the indexed subject, topic and mark total", async () => {
    const sql = await migration();
    const learningFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.record_private_learning_attempt",
      ),
      sql.indexOf(
        "create or replace function public.get_private_learning_progress",
      ),
    );

    expect(learningFunction).toContain(
      "private.past_paper_question_topics mapping",
    );
    expect(learningFunction).toContain(
      "mapping.topic_id = v_topic_id",
    );
    expect(learningFunction).toContain(
      "past-paper question does not match the attempt subject/topic",
    );
    expect(learningFunction).toContain(
      "maximum marks do not match the indexed past-paper question",
    );
  });

  it("requires a paired official markscheme before storing a past-paper score", async () => {
    const sql = await migration();
    const learningFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.record_private_learning_attempt",
      ),
      sql.indexOf(
        "create or replace function public.get_private_learning_progress",
      ),
    );

    expect(learningFunction).toContain(
      "question.pairing_status",
    );
    expect(learningFunction).toContain(
      "question.source_markscheme_document_id is not null",
    );
    expect(learningFunction).toContain(
      "question.markscheme_text is not null",
    );
    expect(learningFunction).toContain(
      "past-paper score requires a paired official markscheme",
    );
  });

  it("preserves past-paper question page provenance", async () => {
    const sql = await migration();

    expect(sql).toContain(
      "page_start integer not null check (page_start > 0)",
    );
    expect(sql).toContain(
      "page_end integer not null check (page_end >= page_start)",
    );
    expect(sql).toContain(
      "(question.value->>'page_start')::integer",
    );
    expect(sql).toContain(
      "(question.value->>'page_end')::integer",
    );
  });

  it("binds source assets to the exact indexed PDF version", async () => {
    const sql = await migration();
    const assetFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.get_private_past_paper_asset",
      ),
      sql.indexOf(
        "create or replace function public.record_private_learning_attempt",
      ),
    );

    expect(sql).toContain(
      "source_question_version_id uuid not null references private.document_versions(id)",
    );
    expect(sql).toContain(
      "v_question_version_id,",
    );
    expect(assetFunction).toContain(
      "version.id = question.source_question_version_id",
    );
    expect(assetFunction).toContain(
      "version.storage_path",
    );
  });

  it("allows visual-dependent questions in practice search but keeps exact marking text-only", async () => {
    const sql = await migration();
    const searchFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.search_private_past_paper_questions",
      ),
      sql.indexOf(
        "create or replace function public.get_private_past_paper_question",
      ),
    );
    const exactFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.get_private_past_paper_question",
      ),
      sql.indexOf(
        "create or replace function public.get_private_past_paper_asset",
      ),
    );

    expect(searchFunction).toContain(
      "visual_context_required boolean",
    );
    expect(searchFunction).toContain(
      "cardinality(question.asset_references) > 0",
    );
    expect(searchFunction).not.toContain(
      "and cardinality(question.asset_references) = 0",
    );
    expect(exactFunction).toContain(
      "and cardinality(question.asset_references) = 0",
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

  it("exposes safe source-quality counts without private text", async () => {
    const sql = await migration();
    const catalog = sql.slice(
      sql.indexOf(
        "create or replace function public.list_private_study_sources",
      ),
      sql.indexOf(
        "-- Final RPC privilege hardening",
      ),
    );

    expect(catalog).toContain(
      "page_count integer",
    );
    expect(catalog).toContain(
      "ocr_required_page_count integer",
    );
    expect(catalog).toContain(
      "classified_chunk_count integer",
    );
    expect(catalog).toContain(
      "mapping.confidence >= 0.8",
    );
  });

  it("exposes safe paired-question counts without markscheme text in the source catalog", async () => {
    const sql = await migration();

    expect(sql).toContain(
      "paired_question_count integer",
    );
    expect(sql).toContain(
      "visual_dependent_question_count integer",
    );
    expect(sql).toContain(
      "cardinality(question.asset_references) > 0",
    );
    expect(sql).toContain(
      "question.pairing_status = 'paired'",
    );
  });

  it("keeps learning attempts consistent with taxonomy and paper subject", async () => {
    const sql = await migration();
    const progressFunction = sql.slice(
      sql.indexOf(
        "create or replace function public.record_private_learning_attempt",
      ),
      sql.indexOf(
        "create or replace function public.get_private_learning_progress",
      ),
    );

    expect(progressFunction).toContain(
      "attempt topic does not match the subject taxonomy",
    );
    expect(progressFunction).toContain(
      "question.subject = v_subject",
    );
    expect(progressFunction).toContain(
      "past-paper question does not match the attempt subject",
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
