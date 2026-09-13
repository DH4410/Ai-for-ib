# Private source ingestion

This document explains how to add study files that **you are authorized to access** without putting the files or their extracted contents in the public Git repository.

## What stays public vs private

Public Git may contain:

- ingestion/retrieval code;
- metadata-only source inventory records;
- tests built from tiny owned fixtures;
- safe source IDs and non-secret provider references.

Public Git must not contain:

- textbook or paper PDFs;
- markscheme PDFs;
- extracted textbook/paper text;
- page images;
- the real source manifest;
- ingestion reports containing private processing state;
- signed URLs, cookies, authorization headers or credentials;
- model weights.

The relevant local paths are ignored by Git:

```text
private-sources/
private-index/
data/source-manifest.jsonl
data/ingestion-reports/
models/
```

Before committing anything, run:

```bash
npm run verify:private
```

## 1. Obtain the file normally

Use the provider's normal browser/app download flow while signed into your own authorized account.

Do not put a temporary download URL, cookie, token or login credential into the inventory or source manifest. The ingestion CLI accepts a **local file path only** and intentionally does not accept URLs.

For the first textbook set, the metadata inventory already contains:

| Source ID | Subject | Expected source |
| --- | --- | --- |
| `chemistry-pearson-2025` | Chemistry | HL Chemistry Pearson Book 2025 |
| `physics-oxford-2023` | Physics | Physics Course Companion, Fifth Edition |
| `mathematics-aa-hl-higher-book` | Mathematics AA HL | Higher_book.pdf |

## 2. Run local ingestion

From the repository root, use the matching source ID and the local file you downloaded.

Windows examples:

```powershell
npx tsx scripts/ingest-source.ts --source-id chemistry-pearson-2025 --input "C:\Users\dimah\Downloads\HL_Chemistry_pearson_book_2025.pdf"

npx tsx scripts/ingest-source.ts --source-id physics-oxford-2023 --input "C:\Users\dimah\Downloads\Physics Course Companion.pdf"

npx tsx scripts/ingest-source.ts --source-id mathematics-aa-hl-higher-book --input "C:\Users\dimah\Downloads\Higher_book.pdf"
```

A custom metadata inventory can be selected with:

```powershell
npx tsx scripts/ingest-source.ts --source-id my-source --input "C:\path\book.pdf" --inventory "C:\path\inventory.json"
```

## 3. What the command does

For each local source, the pipeline:

1. validates the source and destination paths;
2. records a safe `materialization_started` manifest event;
3. copies the file into `private-sources/<subject>/` without overwriting another file;
4. computes a SHA-256 checksum;
5. detects an already-known checksum and records a duplicate instead of replacing the original;
6. extracts each PDF page with its original one-based page number;
7. classifies unusable/selectable-text-poor pages as `ocr_required`;
8. writes extracted page data under `private-index/extracted/`;
9. builds page-aware semantic chunks only from pages with usable selectable text;
10. classifies those chunks against the current IB topic taxonomy and writes them under `private-index/chunks/`;
11. writes a safe ingestion report under `data/ingestion-reports/`;
12. appends an `ingested` event with the real chunk count to the local manifest.

The CLI prints only a safe summary: checksum, page count, chunk count, OCR-required page count, source ID and status.

## OCR handling

The current pipeline detects pages that need OCR but does **not** automatically run destructive OCR.

That is intentional. A later OCR pass should preserve:

- the original PDF;
- original page numbers;
- figures/equations;
- extraction method;
- confidence/quality state.

A source with some OCR-required pages can still be inspected, but those pages should not be treated as reliable text until OCR has been completed.

## Resume and duplicate behavior

The manifest is append-only. Existing history is not rewritten.

If the same exact file checksum has already been materialized, the pipeline records a duplicate and avoids silently replacing the first copy. If extraction fails, it records a safe failure stage/summary without persisting secrets or raw source text in the manifest.

## 4. Private Supabase prerequisites

Production retrieval expects:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=
```

Apply `supabase/migrations/20260913000000_private_study_foundation.sql` to the project's Supabase database before enabling production source retrieval.

The migration creates the private source schema, pgvector column/indexes, constrained search RPCs and learner-state tables.

The service-role key is server-only. Never expose it through `NEXT_PUBLIC_*` variables or browser code.

## 5. Inspect before indexing

After each source:

- confirm the page count is plausible;
- review the OCR-required count;
- verify the title/source ID match the actual file;
- spot-check original page numbers and headings;
- verify the file is absent from `git status`;
- run `npm run verify:private`.

Do not index a file with the wrong source ID or obviously broken page extraction.

## Current scope

The ingestion foundation handles local PDFs and prepares page-aware content for private retrieval. It does not automate provider logins/downloads, bypass access controls, or train the LLM on copyrighted textbook passages.

The first practical goal is to ingest the three authorized textbooks above, then add selected private notes and past-paper material using the same boundary.


## 6. Load an ingested source into private retrieval

After local ingestion has produced `private-index/extracted/` and `private-index/chunks/`, the source can be loaded into the private Supabase schema through a service-role-only RPC.

The browser never receives the service-role key. Keep these values in a private local/server environment:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Embeddings are optional. For hybrid vector + lexical retrieval also configure:

```env
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=
```

The current database vector column is 1,024 dimensions. The index command rejects vectors with a different dimension instead of silently writing incompatible data.

Index the latest locally ingested version:

```powershell
npm run study:index -- --source-id physics-oxford-2023
```

Force lexical-only indexing:

```powershell
npm run study:index -- --source-id physics-oxford-2023 --no-embeddings
```

Select an exact immutable version when more than one checksum exists:

```powershell
npm run study:index -- --source-id physics-oxford-2023 --checksum <sha256>
```

The command reads ignored local artifacts, sends private chunk content only to the configured Supabase backend, and prints only safe counts/checksum metadata. A successful run appends an `indexed` event to the ignored local manifest.

The private schema itself does not need to be exposed through the Data API. The migration provides `public.index_private_study_source(...)`, revokes it from public/anonymous/authenticated callers, and grants execution only to `service_role`.

### Current deployment status

The repository contains the database foundation and loader, but do not point it at an unrelated Supabase project. Create or select a dedicated AI-for-IB project first, then apply the foundation migration and configure its URL/service-role key privately.
