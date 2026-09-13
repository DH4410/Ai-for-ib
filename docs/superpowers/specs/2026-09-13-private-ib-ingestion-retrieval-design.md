# Private IB Ingestion and Retrieval Design

**Status:** Approved foundation design

**Goal:** Turn the existing standalone tutor into a source-aware private study system for Chemistry HL, Physics HL and Mathematics: Analysis and Approaches HL without placing licensed books, papers, markschemes, extracted text, credentials, or model weights in the public repository.

## Scope and delivery order

This design deliberately covers the first independent subsystem: private source acquisition, document ingestion, topic-aware hybrid retrieval, and the data structures that the later practice and learning-memory features need. It preserves the current Next.js UI, `/api/chat`, model abstraction, prompt builder, and subject/mode model.

Later subsystems are explicitly deferred to separate specifications:

1. practice-session and marking UI built over the question and markscheme records defined here;
2. authenticated student profile and learning-memory UI built over the learning tables defined here;
3. model benchmarking, LoRA/QLoRA data preparation, Colab notebooks, and self-hosted deployment;
4. UI controls for topic, paper style, difficulty, source filters, math rendering, and citations.

## Non-negotiable constraints

- The application remains standalone. An OpenAI-compatible endpoint is only a wire format for a self-hosted or otherwise user-controlled model server.
- No source PDF, image, raw extracted text, markscheme text, model weight, API key, session cookie, signed URL, or database dump may enter Git.
- Source collection uses only normal access already granted to the student. It never bypasses authentication, paywalls, CAPTCHAs, robots controls, or rate limits.
- Every parse, download, duplicate decision, extraction failure, question-pairing ambiguity, and index result is recorded. No stage may silently claim success.
- Textbook chunks retain physical page numbers. Past-paper records retain exact session, timezone, paper and question identifiers.
- The initial imported paper set is May 2025 English-language HL material for Chemistry, Physics and Mathematics AA. May 2026 “More Papers” remain `question_only` because matching markschemes were not present in the visible source directory.

## Storage boundary

### Local development

The developer machine has three ignored directories:

```text
private-sources/
  chemistry/
  physics/
  mathematics/
  ib/
private-index/
  extracted/
  OCR/
  assets/
data/
  source-manifest.jsonl
```

`private-sources/` contains immutable raw downloads. `private-index/` contains copyrighted derivative text, page images, extracted figures, and parser caches. The real manifest remains local because it includes private source paths and checksums. The public repository receives only schema migrations, importer code, non-copyright fixture data, an empty manifest example, and documentation.

The importer writes a JSONL manifest entry before and after each materialization attempt. A successful entry contains a stable `source_id`, SHA-256 checksum, byte count, MIME type, acquisition timestamp, local relative path, source class/path, inferred subject and document type. It never stores a signed download URL or source text. A failed entry contains the failure stage and a safe error summary.

### Production

Use Supabase Postgres for private metadata, topic mappings, chunks, embeddings, paper structures, question-markscheme links and learning history. Use a **private** Supabase Storage bucket named `study-sources` for raw files when a cloud deployment is needed. The local files remain the default for development and can be uploaded by an explicit, resumable command later.

The browser never receives a Supabase service-role key and never queries source-text tables directly. Next.js route handlers are the only public application boundary. Private content lives in a non-exposed `private` schema; the public schema contains no licensed source text. The production project must explicitly keep the Data API disabled for `private`, enable RLS wherever an exposed table is ever introduced, and use server-side access only for administrative ingestion.

## Source catalogue

Each raw file has one `documents` row and may have several `document_versions` rows. A source is never overwritten: a second download is a version with its own checksum and acquisition record.

Required document metadata:

```ts
type DocumentRecord = {
  id: string;
  subject: "chemistry" | "physics" | "mathematics" | "ib";
  documentType:
    | "textbook"
    | "study-guide"
    | "workbook"
    | "worksheet"
    | "syllabus"
    | "data-booklet"
    | "notes"
    | "question-paper"
    | "markscheme"
    | "specimen-paper"
    | "other";
  title: string;
  filename: string;
  author?: string;
  publisher?: string;
  sourceProvider: "managebac" | "ibdocs" | "manual";
  sourcePath: string;
  usefulForKnowledgeBase: boolean;
  copyrightStatus: "private-licensed" | "user-provided" | "unknown";
};
```

The first textbook priority is:

| Subject | Primary source | Supporting sources |
|---|---|---|
| Chemistry HL | `HL_Chemistry_pearson_book_2025.pdf` | Oxford 2023 study guide, Cambridge 2023 workbook, worked solutions, 2025 data booklet |
| Physics HL | Oxford Physics Course Companion, fifth edition, 2023 | Physics Guide, syllabus, data booklet, key-concept sheets and revision packs |
| Mathematics AA HL | `Higher_book.pdf` | Term planner, chapter PDFs, practice Papers 1–3 |

The importer extracts bibliographic PDF metadata after materialization. It does not guess an unknown author or publisher from a filename.

## Ingestion pipeline

```text
source inventory
  -> resumable materialization + checksum
  -> safe PDF inspection
  -> text-first page extraction
  -> OCR only for pages without usable text
  -> heading/page/section reconstruction
  -> semantic chunks or paper-question candidates
  -> topic classification with confidence
  -> lexical index + embeddings
  -> validation report
```

### PDF handling

The parser processes PDFs page by page, preserving original one-based page numbers. It chooses normal text extraction when a page contains usable selectable text. OCR is a fallback only when a page’s extracted character count or character quality falls below a documented threshold. It records OCR use and confidence per page.

The parser captures headings, paragraphs, tables where structurally extractable, displayed equations as extracted text plus page-local references, captions, and figure placeholders. It records page image or figure artifact paths privately rather than embedding binary data in the database. A parse error creates a failed page record and does not discard the source document.

### Textbook chunks

A chunk never crosses a page boundary without retaining every source page it spans. The default boundary is a detected heading or subheading; within a long section it splits around paragraphs/examples with target sizes measured in tokens, overlap limited to the preceding paragraph, and a title path such as `Theme B > B.1 > Specific latent heat`.

```ts
type ContentChunk = {
  id: string;
  documentId: string;
  subject: "chemistry" | "physics" | "mathematics";
  title: string;
  headingPath: string[];
  pageStart: number;
  pageEnd: number;
  text: string;
  equationReferences: string[];
  figureReferences: string[];
  topicIds: string[];
  topicConfidence: number;
};
```

### Past-paper extraction and pairing

Question papers are segmented into question and subquestion candidates, never stored as a single giant chunk. A parser uses document layout, question-number patterns, marks, page progression and optional question images. The output is reviewed through a status field: `candidate`, `validated`, `ambiguous`, or `failed`.

Markscheme parsing uses the same status model. The pairing service first matches normalized metadata from filenames and document metadata: subject, syllabus version, year, session, timezone, level, paper, language and component. It links only a unique high-confidence match. Missing or conflicting matches become `ambiguous` and are excluded from automated marking until reviewed.

```ts
type PastPaperQuestion = {
  id: string; // e.g. physics-2025-may-tz2-p2-q5b
  subject: "chemistry" | "physics" | "mathematics";
  syllabusVersion: string;
  level: "HL" | "SL";
  year: number;
  session: "may" | "november";
  timezone: string;
  paper: string;
  questionNumber: string;
  subquestion?: string;
  marks?: number;
  commandTerms: string[];
  topicIds: string[];
  topicConfidence: number;
  questionText: string;
  assetReferences: string[];
  markschemeText?: string;
  sourceQuestionDocumentId: string;
  sourceMarkschemeDocumentId?: string;
  pairingStatus: "paired" | "question_only" | "ambiguous";
};
```

## Topic taxonomy

The public taxonomy stores only identifiers and short topic labels. It begins with the current curriculum structure:

- Chemistry: Structure 1–3 and Reactivity 1–3;
- Physics: Themes A–E;
- Mathematics AA: Number and algebra, functions, geometry and trigonometry, statistics and probability, calculus, and investigation/problem-solving skills.

Each topic has an ID, subject, parent topic, curriculum statement reference when available, display label and version. Classification follows three steps: trusted source metadata; deterministic title/keyword rules; then an optional model-assisted classifier. Every non-manual classification saves its method and confidence. Low-confidence or conflicting mappings remain searchable by source text but do not qualify for strict topic practice filters.

## Retrieval design

The existing `retrieveStudyContext` interface stays intact for the chat route. Its implementation gains optional filters internally while retaining the current public contract:

```ts
retrieveStudyContext({ subject, query, limit }): Promise<SourceChunk[]>
```

The retrieval request is constrained before ranking:

1. subject is mandatory;
2. document types are chosen by mode (`textbook`/`syllabus` for Learn; `question-paper` for Practice; paired markschemes only for Mark);
3. explicit topic and paper constraints are applied when present;
4. full-text search and vector similarity each form candidate sets;
5. a deterministic reciprocal-rank fusion combines candidates;
6. a small reranker selects the final chunks;
7. every returned result includes document title plus page or question locator.

Postgres Full Text Search receives a generated `tsvector` and GIN index. Embeddings use `vector` in the private schema, with its dimension set by the selected self-hosted embedding model rather than hard-coded to an unrelated provider. Vector candidate selection must be iterative or over-fetched before post-filtering so restrictive subject/topic filters do not return too few results. Embedding generation is an adapter and is never an implicit ChatGPT dependency.

The chat prompt receives only the selected passages and stable source locators. The response API returns those locators so the UI can show citations such as `Physics Course Companion — Theme B.1 — p. 204`.

## Database outline

Private tables and their primary relationships:

```text
documents 1---* document_versions 1---* document_pages 1---* content_chunks
documents 1---* past_paper_questions *---0..1 question_markscheme_links
topics *---* content_chunks
topics *---* past_paper_questions
student_profiles 1---* learning_events *---1 past_paper_questions
student_profiles 1---* topic_mastery
```

`learning_events` records subject, topic, question, score, maximum marks, hints used, attempt number, misconception tags, confidence, elapsed time and timestamp. `topic_mastery` stores a calculated estimate and next-review date, not model weights. This makes future adaptive revision possible without model retraining.

## Security and operational controls

- Raw source buckets are private; signed access is created only by server code after authorization.
- Administrative import endpoints require a private server secret and are not exposed in the learner UI.
- User-facing APIs authorize the active user before returning progress, source locators or study content.
- RLS is enabled on any exposed user-data table with both ownership `USING` and `WITH CHECK` predicates for updates. No authorization policy relies on editable user metadata.
- `MODEL_API_KEY`, Supabase service credentials, source access tokens and local source paths appear only in `.env.local` or the deployment secret manager.
- `.env.example` documents variable names without values.
- The app has no public upload, file listing, document preview or unrestricted source search endpoint in this milestone.

## Verification plan

All production behavior is built test-first using small, owned fixtures—not textbook or past-paper text. Tests must cover:

1. manifest resume, checksum, duplicate and failed-download records;
2. page-number preservation and semantic heading-aware chunk boundaries;
3. OCR fallback selection and parse-failure recording;
4. strict subject filtering so Physics retrieval cannot return Chemistry or Mathematics;
5. source title/page locator formatting;
6. unique question/markscheme pairing, missing match and ambiguous match handling;
7. topic-rule confidence behavior;
8. chat API validation and source-citation response shape;
9. practice selection query filters for subject, year, level, paper, topic and pairing status.

Each milestone runs TypeScript typechecking, unit tests and a Next production build. The importer additionally produces a machine-readable validation report with source counts, parsed pages, OCR pages, chunks, candidate questions, validated pairings, ambiguous pairings and failures.

## Explicitly out of scope for this milestone

- Bulk downloading hundreds of papers before the resumable manifest runner is implemented.
- Automatic use of May 2026 question-only material for marking.
- Fine-tuning any model on textbook or paper text.
- A paid Supabase plan, paid GPU service, model hosting, or automatic cloud upload.
- Replacing the current tutor UI or model protocol.
