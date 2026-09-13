# Architecture

## Product boundary

AI for IB is a standalone study application. The browser talks to this application's API, and the API talks to a model endpoint and private study repository that we control.

It is intentionally **not coupled to ChatGPT**.

## Request path

```text
Browser
  -> Next.js /api/chat
     -> request validation
     -> retrieval filters
     -> lexical + vector source search
     -> reciprocal-rank fusion
     -> citation-aware tutor prompt
     -> self-hosted model endpoint
  <- answer + safe citation metadata
```

Private chunk text is used server-side as model context. The browser receives only stable citation metadata such as source ID, title, locator, document type, topic IDs and page/question fields.

## Model layer

The implementation expects an OpenAI-compatible `/v1/chat/completions` endpoint because that protocol is supported by self-hosted inference servers such as vLLM.

That is only the wire protocol. The model itself can be an open-weight model hosted on our own GPU infrastructure.

Planned model work:

1. benchmark suitable base models for IB Physics/Chemistry/Math;
2. build owned or permitted tutor/marking instruction data;
3. fine-tune with LoRA/QLoRA in Google Colab or another GPU environment;
4. evaluate against a held-out IB-style benchmark;
5. deploy the selected checkpoint behind the same model API.

Textbook passages are **not** the primary fine-tuning strategy. Factual course content stays in retrieval so it can remain source-aware and updateable.

## Knowledge layer

The implemented source pipeline is:

```text
authorized local file
  -> private materialization + SHA-256 manifest
  -> PDF page extraction
  -> OCR-required page detection
  -> semantic/page-aware chunking
  -> IB topic classification
  -> private Supabase persistence
  -> lexical + vector search
  -> filter-first rank fusion
  -> cited model context
```

Use retrieval for:

- licensed textbooks;
- syllabus/specification documents;
- student notes;
- worked examples;
- past-paper questions;
- markschemes.

Each chunk keeps source metadata, original page ranges, heading paths and stable identifiers.

## Past papers

Question papers and markschemes are represented as structured records rather than treated only as whole PDFs.

The parser/pairing layer normalizes:

- subject;
- syllabus version;
- topic/subtopic;
- session and year;
- timezone;
- level;
- paper/component;
- language;
- question/sub-question;
- marks where visible;
- command terms where available;
- question body;
- required figures/assets;
- markscheme linkage;
- source locator.

Pairing is conservative: a paper is `paired` only when one unique markscheme matches the full key. Missing schemes remain `question_only`; collisions remain `ambiguous` for manual review.

## Student model

Learning state belongs in the database, not in LLM weights:

- attempts;
- scores;
- hints used;
- misconceptions;
- confidence;
- topic mastery estimates;
- spaced-repetition due dates.

This gives personalization without retraining the model after every study session.

## Storage and database boundary

The Supabase migration creates a non-exposed `private` schema for documents, versions, pages, chunks, topics, past-paper records and learner state.

Source search is exposed only through constrained server-side RPCs executed with the service role. The browser never receives the service-role key or direct private-storage access.

The vector schema currently uses 1,024-dimensional embeddings, matching the configured self-hosted embedding endpoint.

## Security / copyright

The GitHub repository may remain public, but licensed books, papers, markschemes, extracted source text, page images, signed URLs, cookies, model weights and credentials must remain outside Git.

The repository enforces this with:

- ignored private source/index/report paths;
- extension checks for common study binaries and model weights;
- `npm run verify:private`;
- CI verification before tests/typechecking/build.

See `docs/INGESTION.md` and `docs/PAST_PAPERS.md` for the operating workflow.
