# Past-paper workflow

Past papers are useful for practice and marking only when their metadata and markscheme relationship are trustworthy. This project therefore uses conservative pairing rather than guessing.

## First target

The initial paper target is **May 2025 English HL** for:

- Chemistry;
- Physics;
- Mathematics: Analysis and Approaches.

The metadata-only source inventory includes records for these targets. Actual paper and markscheme files remain private and must be obtained through normal authorized access.

May 2026 material should remain `question_only` when a matching markscheme has not been normally obtained and verified.

## Metadata key

Each paper/markscheme should normalize at least:

- subject;
- syllabus version;
- level;
- year;
- session;
- timezone;
- paper/component;
- language;
- document kind.

A unique full-key match produces `paired`.

No matching markscheme produces `question_only`.

More than one matching markscheme candidate produces `ambiguous`; it must be reviewed instead of silently choosing one.

## Recommended file workflow

1. Download the question paper and matching markscheme through normal authorized browser access.
2. Keep both files outside Git.
3. Add or verify metadata-only inventory records.
4. Ingest each local PDF through the same private source pipeline described in `docs/INGESTION.md`.
5. Parse/normalize paper metadata.
6. Run conservative paper/markscheme pairing.
7. Review every `ambiguous` result manually.
8. Extract question/sub-question candidates while preserving original page ranges and structural locators.
9. Classify topics with a confidence/method record.
10. Index only records that satisfy the desired practice filters.

## Question records

Structured question records should preserve:

- stable question ID;
- source question document;
- source markscheme document when paired;
- subject and syllabus version;
- HL/SL;
- year, session and timezone;
- paper/component;
- question/sub-question;
- marks when visibly available;
- command terms when available;
- question text;
- asset/figure references;
- topic IDs and classification confidence;
- pairing status.

Where parsing is uncertain, preserve uncertainty rather than inventing a clean record.

## Practice selection rules

For requests such as "real Paper 2 Physics questions from 2022-2025", retrieval filters should be applied **before** ranking.

When `realPastPapersOnly` is requested:

- use question-paper records, not textbook-generated practice;
- respect requested year/paper/topic filters;
- prefer only sufficiently confident topic classification for strict topic practice;
- require `paired` when marking against a markscheme is needed.

A `question_only` paper can still be used for question practice, but the tutor should not pretend it has an official markscheme.

## Copyright boundary

Do not commit paper/markscheme PDFs or extracted question/markscheme text to this public repository.

Do not store direct download links, signed URLs, cookies, tokens or authentication details in the source inventory or manifest.

The repository may contain metadata, parsing logic and tiny owned test fixtures. Real question text belongs in private storage/database only.


## One-command private indexing

The repository now includes a conservative local-to-private-database loader. It does **not** guess metadata from filenames. Supply the normalized paper identity explicitly so a PDF cannot silently land under the wrong year/timezone/component.

Example for an authorized local Physics May 2025 HL TZ2 Paper 2 pair:

```powershell
npm run paper:index -- `
  --question "C:\Users\dimah\Downloads\physics_m25_hl_tz2_p2.pdf" `
  --markscheme "C:\Users\dimah\Downloads\physics_m25_hl_tz2_p2_ms.pdf" `
  --subject physics `
  --year 2025 `
  --session may `
  --timezone TZ2 `
  --level HL `
  --paper p2 `
  --language English `
  --provider ibdocs
```

For a question paper whose authorized markscheme is not available yet, omit `--markscheme`. Its extracted records remain `question_only`, so they can be used for real-question practice but not represented as officially markable.

The command:

1. copies each authorized local PDF to immutable ignored `private-sources/` storage;
2. records SHA-256 provenance in the ignored manifest;
3. extracts only pages with usable selectable text and reports pages that still require OCR;
4. segments question/subquestion candidates;
5. matches a markscheme only by the explicit full paper identity and question locator;
6. skips ambiguous candidate matches rather than guessing;
7. classifies question topics conservatively;
8. atomically replaces the structured records for that paper through the server-only `index_private_past_paper` RPC;
9. writes a safe count-only report under ignored `data/ingestion-reports/past-papers/`.

Required server configuration:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

The legacy `SUPABASE_SERVICE_ROLE_KEY` remains accepted as a fallback. Real question/markscheme text is sent only to the configured private database and is never written into Git.


## Visual-dependent questions

The current structured practice UI is text-first. During paper indexing, questions whose extracted wording explicitly depends on a graph, diagram, figure, image, or a visual "shown below/above" are tagged with `visual-context-required`.

Those records stay in the private database for provenance but are excluded from real-question retrieval until the corresponding visual assets can be preserved and rendered. The indexing report includes `visualDependentQuestionCount` so this loss is visible instead of silently serving incomplete questions.
