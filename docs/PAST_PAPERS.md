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
