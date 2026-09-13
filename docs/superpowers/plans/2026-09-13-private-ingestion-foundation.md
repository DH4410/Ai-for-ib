# Private Ingestion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the private source-aware foundation that lets the standalone tutor ingest authorized study files, retrieve cited passages, and represent real IB past-paper questions without placing licensed material in Git.

**Architecture:** Preserve the current Next.js UI, API chat route, prompt builder, and OpenAI-compatible model adapter. Add a local ignored-source pipeline, private Supabase persistence for production, and pure TypeScript modules for chunking, topic classification, question pairing, ranking, and API validation. The browser calls only the Next.js API; it never accesses source storage directly.

**Tech Stack:** Next.js 16, TypeScript strict mode, Node 22, Vitest, pdfjs-dist, Supabase Postgres plus pgvector and private Storage, and a configurable self-hosted 1,024-dimension embedding endpoint.

**Spec:** docs/superpowers/specs/2026-09-13-private-ib-ingestion-retrieval-design.md

## Global Constraints

- Never commit source PDFs, page images, extracted source text, markscheme text, model weights, secrets, signed URLs, cookies, or database dumps.
- Keep private-sources, private-index, the real manifest, and ingestion reports ignored. Tests use only tiny owned fixtures.
- Use ordinary authorized access only; do not bypass authentication, paywalls, CAPTCHA, rate limits, or robots controls.
- Preserve textbook page numbers and exact paper/session/timezone/paper/question IDs.
- Preserve chat behavior when no retrieval database has been configured.
- Use test-first development. Every production behavior below starts with a focused failing Vitest test.
- Run private-boundary verification, unit tests, TypeScript checks, and a production build before each checkpoint commit.
- The user asked for immediate inline execution; this plan is executed in this session after the workspace-isolation check.

---

## File Structure

| Path | Responsibility |
|---|---|
| .gitignore, .env.example, scripts/verify-private-boundary.ts | Enforce and document the no-licensed-source/no-secret Git boundary. |
| lib/security/private-boundary.ts | Pure protected-path policy used by CI and tests. |
| lib/study-source/types.ts, lib/study-source/manifest.ts | Source records and append-only resumable manifest. |
| lib/ingestion modules, scripts/ingest-source.ts | Safe local materialization, PDF inspection, OCR state, and page-aware chunks. |
| lib/taxonomy modules, lib/past-papers modules | Topic confidence, question candidates, and conservative paper/markscheme pairing. |
| supabase/migrations, lib/database/supabase-server.ts | Non-exposed study schema and server-only access. |
| lib/retrieval modules and lib/retrieval.ts | Filter-first lexical/vector fusion and cited source retrieval. |
| lib/api/chat-request.ts and app/api/chat/route.ts | Typed request validation and citation-only API responses. |
| data/source-inventory.example.json and docs | Metadata-only authorized-source workflow instructions. |
| tests | Owned behavior fixtures; no textbook or paper text. |

## Task 1: Test harness and private-source safety boundary

**Files:**
- Modify: .gitignore, package.json, .github/workflows/ci.yml
- Create: .env.example, vitest.config.mts, lib/security/private-boundary.ts, scripts/verify-private-boundary.ts, tests/security/private-boundary.test.ts

**Interfaces:**
- Produces findPrivateBoundaryViolations(paths: string[]): string[].
- Produces assertPrivateBoundary(paths: string[]): void.
- Produces npm test and npm run verify:private.

- [x] **Step 1: Write the failing policy test**

    import { describe, expect, it } from "vitest";
    import { findPrivateBoundaryViolations } from "@/lib/security/private-boundary";

    describe("private study boundary", () => {
      it("rejects raw and derived licensed source paths", () => {
        expect(findPrivateBoundaryViolations([
          "private-sources/physics/book.pdf",
          "private-index/extracted/book.json",
          "data/source-manifest.jsonl",
        ])).toEqual([
          "private-sources/physics/book.pdf",
          "private-index/extracted/book.json",
          "data/source-manifest.jsonl",
        ]);
      });

      it("allows code and the empty manifest example", () => {
        expect(findPrivateBoundaryViolations([
          "lib/retrieval.ts",
          "docs/INGESTION.md",
          "data/source-manifest.example.jsonl",
        ])).toEqual([]);
      });
    });

- [x] **Step 2: Run RED**

Run: npm test -- tests/security/private-boundary.test.ts

Expected: FAIL because the test runner/module does not yet exist.

- [x] **Step 3: Implement the minimum safety boundary**

Add vitest and tsx dev dependencies plus test, test:watch, and verify:private scripts. Configure the current TypeScript alias in vitest.config.mts.

Implement normalized-slash path matching. Reject private-sources, private-index, data/source-manifest.jsonl, data/ingestion-reports, dotenv files other than .env.example, and binary study/model extensions: .pdf, .ppt, .pptx, .doc, .docx, .epub, .gguf, and .safetensors.

Make the verification script list index plus unignored paths using git ls-files --cached --others --exclude-standard, then throw a safe multiline error for violations.

Add the following ignored paths:

    private-sources/
    private-index/
    data/source-manifest.jsonl
    data/ingestion-reports/
    .worktrees/
    .env.*
    !.env.example

Document value-free names in .env.example: MODEL_BASE_URL, MODEL_NAME, MODEL_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL, EMBEDDING_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and INGESTION_ADMIN_SECRET.

- [x] **Step 4: Run GREEN and add CI enforcement**

Run: npm test -- tests/security/private-boundary.test.ts
Expected: tests pass.

Insert npm run verify:private before typechecking in CI.

Run: npm test && npm run verify:private && npm run typecheck && npm run build
Expected: every command exits 0.

- [x] **Step 5: Commit**

Run: git add .gitignore .env.example package.json package-lock.json vitest.config.mts lib/security/private-boundary.ts scripts/verify-private-boundary.ts tests/security/private-boundary.test.ts .github/workflows/ci.yml
Run: git commit -m "feat: protect private study sources"

## Task 2: Source contracts and append-only resumable manifest

**Files:**
- Create: lib/study-source/types.ts, lib/study-source/manifest.ts, tests/study-source/manifest.test.ts
- Create: data/source-manifest.example.jsonl, data/source-inventory.example.json

**Interfaces:**
- Produces SourceDocument, ManifestEvent, appendManifestEvent, readManifestEvents, latestMaterializationBySource, and findDuplicateByChecksum.
- Manifest data contains only source metadata, checksum, local relative path, state, and safe failure details.

- [x] **Step 1: Write failing manifest tests**

    it("keeps an append-only start and materialized history", async () => {
      await appendManifestEvent(manifestPath, startedEvent);
      await appendManifestEvent(manifestPath, completedEvent);

      expect(await latestMaterializationBySource(manifestPath, "chemistry-pearson-2025"))
        .toMatchObject({ status: "materialized", checksumSha256: "a".repeat(64) });
    });

    it("finds a duplicate checksum and rejects signed URLs", async () => {
      await appendManifestEvent(manifestPath, completedEvent);

      expect(await findDuplicateByChecksum(manifestPath, "a".repeat(64)))
        .toMatchObject({ sourceId: "chemistry-pearson-2025" });
      await expect(appendManifestEvent(manifestPath, {
        ...completedEvent, sourceUrl: "https://private.example/token",
      })).rejects.toThrow("forbidden manifest key");
    });

- [x] **Step 2: Run RED**

Run: npm test -- tests/study-source/manifest.test.ts

Expected: FAIL with module-not-found for the manifest module.

- [x] **Step 3: Implement contracts and manifest**

Define document types and ManifestEvent variants: materialization_started, materialized, duplicate, failed, and ingested. Require ISO timestamp, source ID, status and, where relevant, SHA-256 checksum, byte count, MIME type, and local relative path. Recursively reject keys matching url, token, cookie, authorization, or text.

Append JSONL one line at a time. Report corrupt JSONL with its line number. Calculate latest state without changing old events. Use temporary directories in tests. Populate the example inventory with metadata-only initial records; author and publisher remain null until PDF metadata has been extracted.

- [x] **Step 4: Run GREEN and commit**

Run: npm test -- tests/study-source/manifest.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add lib/study-source data/source-manifest.example.jsonl data/source-inventory.example.json tests/study-source/manifest.test.ts
Run: git commit -m "feat: add private source manifest"

## Task 3: Safe local materialization and page-aware semantic chunks

**Files:**
- Create: lib/ingestion/types.ts, lib/ingestion/materialize.ts, lib/ingestion/pdf.ts, lib/ingestion/chunks.ts, scripts/ingest-source.ts
- Create: tests/ingestion/materialize.test.ts, tests/ingestion/chunks.test.ts
- Modify: package.json

**Interfaces:**
- Consumes SourceDocument and manifest records.
- Produces materializeLocalSource, assessExtractedPage, buildSemanticChunks, ExtractedPage, and ContentChunk.

- [ ] **Step 1: Write failing materialization and chunk tests**

    it("copies an authorized local file under its private subject directory", async () => {
      const result = await materializeLocalSource({
        source: chemistryBook, inputPath: fixturePdf, privateSourcesRoot, manifestPath,
      });

      expect(result).toMatchObject({
        status: "materialized",
        relativePath: "chemistry/chemistry-pearson-2025.pdf",
      });
    });

    it("keeps original page numbers and detected headings", () => {
      const chunks = buildSemanticChunks([
        page(43, "B.1 Specific latent heat\nLatent heat changes state."),
        page(44, "Worked example\nCalculate the energy needed."),
      ], { documentId: "physics-oxford-2023", subject: "physics" });

      expect(chunks[0]).toMatchObject({
        headingPath: ["B.1 Specific latent heat"], pageStart: 43, pageEnd: 44,
      });
    });

    it("requires OCR only when selectable text is unusable", () => {
      expect(assessExtractedPage(page(9, ""))).toMatchObject({ extractionMethod: "ocr_required" });
      expect(assessExtractedPage(page(10, "Readable selectable text ".repeat(5))))
        .toMatchObject({ extractionMethod: "text" });
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/ingestion/materialize.test.ts tests/ingestion/chunks.test.ts

Expected: FAIL with missing ingestion modules.

- [ ] **Step 3: Implement the minimum materializer**

Use lstat, exclusive copyFile, streaming SHA-256, an approved-extension MIME map, and path.relative validation so destinations cannot escape private-sources/subject. Record materialization_started before copying and failed with a safe stage/error summary. A same-checksum file produces duplicate, never overwrites the original. The CLI accepts local file paths only; it never accepts a URL.

- [ ] **Step 4: Implement extraction and chunking**

Add pdfjs-dist to the script-only ingestion path. Extract every PDF page independently with original one-based numbers and item positions. Mark a page text only above a documented usable-text threshold; otherwise persist ocr_required. Do not run destructive OCR automatically.

Build heading/subheading chunks, split long sections at paragraph boundaries, retain all traversed pages, carry preceding-paragraph overlap only, and record equation/figure placeholders. Never create arbitrary fixed-character chunks.

- [ ] **Step 5: Run GREEN and commit**

Run: npm test -- tests/ingestion/materialize.test.ts tests/ingestion/chunks.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add package.json package-lock.json lib/ingestion scripts/ingest-source.ts tests/ingestion
Run: git commit -m "feat: add page-aware private ingestion"

## Task 4: Current IBDP taxonomy and conservative past-paper pairing

**Files:**
- Create: lib/taxonomy/ibdp.ts, lib/taxonomy/classify.ts
- Create: lib/past-papers/metadata.ts, lib/past-papers/pairing.ts, lib/past-papers/questions.ts
- Create: tests/taxonomy/classify.test.ts, tests/past-papers/pairing.test.ts, tests/past-papers/questions.test.ts

**Interfaces:**
- Produces IBDP_TOPICS, classifyTopics, parsePaperMetadata, pairPapersAndMarkschemes, and extractQuestionCandidates.
- Pair status is exclusively paired, question_only, or ambiguous.

- [ ] **Step 1: Write failing taxonomy and pairing tests**

    it("maps specific latent heat to Physics Theme B with a reason", () => {
      expect(classifyTopics({ subject: "physics", title: "B.1 Specific latent heat", text: "" }))
        .toEqual(expect.objectContaining({
          topicIds: ["physics.b.particulate-matter.specific-latent-heat"],
          method: "heading_rule",
          confidence: 0.98,
        }));
    });

    it("does not silently select between matching markschemes", () => {
      const [result] = pairPapersAndMarkschemes([chemistryTz2Paper2], [markschemeA, markschemeB]);
      expect(result.pairingStatus).toBe("ambiguous");
    });

    it("keeps a visible 2026 question paper without a scheme question_only", () => {
      const [result] = pairPapersAndMarkschemes([physicsM26Paper1A], []);
      expect(result.pairingStatus).toBe("question_only");
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/taxonomy/classify.test.ts tests/past-papers/pairing.test.ts

Expected: FAIL with missing taxonomy/pairing modules.

- [ ] **Step 3: Implement topic and paper logic**

Store only short public labels: Chemistry Structure/Reactivity, Physics Themes A through E, Mathematics AA domains. Use trusted manual metadata, normalized title/heading rules, keywords, then unclassified. Return classification method, reason, and confidence; low confidence cannot satisfy strict topic practice selection.

Normalize subject, syllabus version, year, session, timezone, level, paper, language, and document kind. Pair only a unique full key. Missing schemes are question_only; collision is ambiguous. Split papers into question/subquestion candidates with page range, structural locator, and marks only where visible; leave uncertain candidates ambiguous.

- [ ] **Step 4: Run GREEN and commit**

Run: npm test -- tests/taxonomy/classify.test.ts tests/past-papers/pairing.test.ts tests/past-papers/questions.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add lib/taxonomy lib/past-papers tests/taxonomy tests/past-papers
Run: git commit -m "feat: classify IB topics and pair papers safely"

## Task 5: Private Supabase schema and server-only repository

**Files:**
- Modify: package.json, .env.example
- Create: supabase/migrations/20260913000000_private_study_foundation.sql
- Create: lib/database/supabase-server.ts, lib/retrieval/repository.ts
- Create: tests/database/supabase-server.test.ts, tests/retrieval/repository.test.ts

**Interfaces:**
- Produces StudySourceRepository, InMemoryStudySourceRepository, SupabaseStudySourceRepository, and isStudyRepositoryConfigured.
- Provides searchLexical(request) and searchVector(request), returning filtered ranked candidates.

- [ ] **Step 1: Write failing configuration/repository tests**

    it("is not configured without both Supabase server credentials", () => {
      expect(isStudyRepositoryConfigured({
        SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
      })).toBe(false);
    });

    it("filters by subject and document type before returning candidates", async () => {
      const repository = new InMemoryStudySourceRepository([physicsChunk, chemistryChunk]);
      const result = await repository.searchLexical({
        subject: "physics", documentTypes: ["textbook"], query: "latent heat", limit: 5,
      });

      expect(result.map(({ id }) => id)).toEqual(["physics-b1-p43"]);
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/database/supabase-server.test.ts tests/retrieval/repository.test.ts

Expected: FAIL with missing server/repository modules.

- [ ] **Step 3: Implement the migration and repositories**

Install @supabase/supabase-js. Enable vector without pinning its version; create non-exposed private schema; revoke direct access from anon and authenticated. Create documents, versions, pages, chunks, topics, mappings, paper questions, markscheme links, student profiles, learning events, and topic-mastery tables.

Add generated tsvector plus GIN for source text and vector(1024) plus cosine HNSW for the selected self-hosted embedding dimension. Create constrained server-only SECURITY DEFINER RPCs. Enable RLS on learner-owned tables with both USING and WITH CHECK ownership predicates. No public policy exposes source text.

Use server-only imports and read Supabase URL/service role at request time. The in-memory repository supports owned test fixtures; the Supabase repository invokes the server RPCs.

- [ ] **Step 4: Run GREEN and commit**

Run: npm test -- tests/database/supabase-server.test.ts tests/retrieval/repository.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add package.json package-lock.json .env.example supabase lib/database lib/retrieval/repository.ts tests/database tests/retrieval/repository.test.ts
Run: git commit -m "feat: add private study source repository"

## Task 6: Hybrid cited retrieval behind the existing façade

**Files:**
- Modify: types/study.ts, lib/retrieval.ts, lib/prompt.ts
- Create: lib/retrieval/ranking.ts, tests/retrieval/ranking.test.ts, tests/retrieval/retrieval.test.ts, tests/prompt.test.ts

**Interfaces:**
- Preserves retrieveStudyContext with subject, query, and limit.
- Produces cited SourceChunk records with document type, topic IDs, page/question locator, and stable ID.

- [ ] **Step 1: Write failing rank/citation tests**

    it("fuses results only after strict subject filtering", () => {
      const result = fuseRankings({
        lexical: [physicsB1, chemistryLatentHeat],
        vector: [physicsB1, mathematicsHeatMap],
        subject: "physics",
        limit: 2,
      });

      expect(result.map(({ id }) => id)).toEqual(["physics-b1-p43"]);
    });

    it("formats a page-bearing textbook citation", () => {
      expect(formatSourceLocator(physicsB1))
        .toBe("Physics Course Companion — Theme B.1 — p. 43");
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/retrieval/ranking.test.ts

Expected: FAIL because no ranker/citation formatter exists.

- [ ] **Step 3: Implement filter-first fusion**

Call lexical and vector search with subject, mode-selected document type, topic, year, paper, and paired-only restrictions before fusion. Over-fetch candidates; deduplicate; reciprocal-rank-fuse; prefer matching heading/topic; cap at limit. If Supabase is absent, preserve empty-context chat. The prompt tells the model to cite only provided locators and admit unsupported claims.

- [ ] **Step 4: Run GREEN and commit**

Run: npm test -- tests/retrieval/ranking.test.ts tests/retrieval/retrieval.test.ts tests/prompt.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add types/study.ts lib/retrieval.ts lib/retrieval/ranking.ts lib/prompt.ts tests/retrieval
Run: git commit -m "feat: retrieve cited private study sources"

## Task 7: Chat API filters and citation-only responses

**Files:**
- Create: lib/api/chat-request.ts, tests/api/chat-request.test.ts, tests/api/chat-route.test.ts
- Modify: app/api/chat/route.ts

**Interfaces:**
- Produces parseChatRequest and validated retrieval filters.
- Preserves valid existing subject/mode/message requests.
- Returns stable citation metadata but never private chunks or source URLs.

- [ ] **Step 1: Write failing API-validation tests**

    it("rejects an unknown subject before retrieval", () => {
      expect(() => parseChatRequest({ subject: "biology", mode: "learn", message: "Help" }))
        .toThrow("subject must be chemistry, physics, or mathematics");
    });

    it("keeps Paper 2 practice constraints structured", () => {
      expect(parseChatRequest({
        subject: "physics", mode: "practice", message: "Give questions",
        filters: { paper: "p2", years: [2022, 2025], realPastPapersOnly: true },
      }).filters).toEqual({
        paper: "p2", years: [2022, 2025], realPastPapersOnly: true,
      });
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/api/chat-request.test.ts tests/api/chat-route.test.ts

Expected: FAIL with missing parser and absent restricted source response shape.

- [ ] **Step 3: Implement parsing and route mapping**

Whitelist subjects, modes, and document types. Limit topic IDs and years to ten each; accept only 2020 through 2030; bound non-empty message text. Invalid input returns HTTP 400 and useful JSON. Inject model/retrieval through a small test factory while retaining the route export. Return source id, title, locator, document type, topic IDs, and page/question data only.

- [ ] **Step 4: Run GREEN and commit**

Run: npm test -- tests/api/chat-request.test.ts tests/api/chat-route.test.ts && npm test && npm run verify:private && npm run typecheck && npm run build
Run: git add app/api/chat/route.ts lib/api/chat-request.ts tests/api
Run: git commit -m "feat: validate source-aware chat requests"

## Task 8: Authorized-source operating documentation and checkpoint

**Files:**
- Create: docs/INGESTION.md, docs/PAST_PAPERS.md, tests/data/source-inventory.test.ts
- Modify: docs/ARCHITECTURE.md, README.md, data/source-inventory.example.json

**Interfaces:**
- Documents normal browser download, local CLI materialization, manifest, inspection, pairing, and indexing.
- Initializes metadata only for Chemistry Pearson 2025, Physics Oxford 2023, Mathematics AA HL Higher_book.pdf, and M25 English HL Chemistry/Physics/MAA papers/markschemes.

- [ ] **Step 1: Write failing metadata-only inventory test**

    it("contains approved subjects and no direct download URL", async () => {
      const inventory = await readExampleInventory();

      expect(inventory.map(({ subject }) => subject))
        .toEqual(expect.arrayContaining(["chemistry", "physics", "mathematics"]));
      expect(JSON.stringify(inventory)).not.toMatch(/https?:\/\//);
      expect(inventory.every(({ sourceProvider }) =>
        ["managebac", "ibdocs"].includes(sourceProvider)
      )).toBe(true);
    });

- [ ] **Step 2: Run RED**

Run: npm test -- tests/data/source-inventory.test.ts

Expected: FAIL until required provider, subject, and document-type fields exist.

- [ ] **Step 3: Document exact workflow**

Document local-only commands:

    npm run verify:private
    npx tsx scripts/ingest-source.ts --source-id physics-oxford-2023 --input "C:\Users\dimah\Downloads\Physics Course Companion.pdf"

Explain authorized browser downloading, resume/duplicate behavior, page/OCR reporting, ambiguous pairing review, private Supabase migration prerequisites, and no-paid-service status. State M25 English HL is the first paper target; M26 remains question-only until matching schemes are normally obtained.

- [ ] **Step 4: Run final verification, prove source privacy, and push**

Run: git diff --check && npm run verify:private && npm test && npm run typecheck && npm run build && git status --short
Expected: no whitespace/private-boundary violations; all checks exit 0; unrelated pre-existing status is reported but not staged.

Run: git ls-files | rg "(^private-sources/|^private-index/|^data/source-manifest\.jsonl$|\.(pdf|pptx|docx|epub|gguf|safetensors)$)"
Expected: no output.

Run: git add README.md docs/INGESTION.md docs/PAST_PAPERS.md docs/ARCHITECTURE.md data/source-inventory.example.json tests/data/source-inventory.test.ts
Run: git commit -m "docs: explain private IB source workflow"
Run: git log --oneline origin/main..HEAD && git push

Report the first three normal authorized downloads and materialization commands. Do not begin Colab training in this plan.
