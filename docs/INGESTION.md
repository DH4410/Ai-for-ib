# Private source ingestion

This workflow adds study files that **you are authorized to access** while keeping the files and extracted contents out of public Git.

## Public vs private

Public Git may contain ingestion/retrieval code, metadata-only source inventory records and tiny owned fixtures.

Never commit textbook/paper/markscheme PDFs, extracted source text, page images, real manifests, private ingestion reports, signed URLs, cookies, credentials, training/evaluation data or model weights.

Ignored working paths include:

```text
private-sources/
private-index/
data/source-manifest.jsonl
data/ingestion-reports/
training/private-data/
training/outputs/
models/
```

Always run:

```bash
npm run verify:private
```

## 1. Obtain files normally

Use the provider's normal authorized browser/app download flow. The ingestion CLIs intentionally accept **local file paths**, not URLs, cookies or login tokens.

Metadata-only textbook records currently include:

| Source ID | Subject | Expected source |
| --- | --- | --- |
| `chemistry-pearson-2025` | Chemistry | HL Chemistry Pearson Book 2025 |
| `physics-oxford-2023` | Physics | Physics Course Companion, Fifth Edition |
| `mathematics-aa-hl-higher-book` | Mathematics AA HL | Higher_book.pdf |

## 2. Ingest a textbook/source locally

Examples:

```powershell
npx tsx scripts/ingest-source.ts --source-id chemistry-pearson-2025 --input "C:\Users\dimah\Downloads\HL_Chemistry_pearson_book_2025.pdf"

npx tsx scripts/ingest-source.ts --source-id physics-oxford-2023 --input "C:\Users\dimah\Downloads\Physics Course Companion.pdf"

npx tsx scripts/ingest-source.ts --source-id mathematics-aa-hl-higher-book --input "C:\Users\dimah\Downloads\Higher_book.pdf"
```

The pipeline copies the file into ignored immutable storage, computes SHA-256 provenance, extracts one-based pages, flags weak pages as `ocr_required`, creates page-aware chunks, classifies topics, and writes only ignored artifacts/reports.

OCR-required pages are **not** silently treated as reliable text.

## 3. Repair OCR-required pages

The first extraction pass deliberately excludes weak pages from trusted chunks. If the ingestion report shows `ocrRequiredPageCount > 0`, run OCR only on those flagged pages with a tool you trust. Save the OCR result under the ignored private directory:

```text
private-index/ocr/<source-id>.json
```

Expected private JSON shape:

```json
{
  "pages": [
    {
      "pageNumber": 42,
      "text": "OCR text for this page only"
    }
  ]
}
```

Apply and revalidate the OCR text:

```powershell
npm run study:apply-ocr -- --source-id physics-oxford-2023 --ocr "private-index/ocr/physics-oxford-2023.json"
```

The command:

- only accepts OCR JSON stored under `private-index/ocr/`;
- only replaces pages previously marked `ocr_required`;
- rejects duplicate page numbers and weak/short OCR output;
- marks accepted pages as `ocr`;
- rebuilds semantic chunks and topic classification from all trusted text + OCR pages;
- updates only ignored extraction/chunk/report files;
- appends a new safe `ingested` manifest event with counts only.

It never prints OCR page text to the console.

## 4. Inspect before indexing

Check:

- plausible page count;
- OCR-required count;
- correct title/source ID;
- several page numbers/headings;
- absence of the PDF/extracted text from `git status`;
- `npm run verify:private`.

## 5. Dedicated Supabase setup

Use a dedicated AI-for-IB project, not an unrelated project.

Apply:

```text
supabase/migrations/20260913000000_private_study_foundation.sql
```

Server configuration:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

The legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted as a fallback.

Browser auth configuration:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The secret/service-role key must never be placed in a `NEXT_PUBLIC_*` variable.

## 6. Index an ingested source

Optional embeddings:

```env
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=
```

Index the latest ingested version:

```powershell
npm run study:index -- --source-id physics-oxford-2023
```

Lexical-only:

```powershell
npm run study:index -- --source-id physics-oxford-2023 --no-embeddings
```

Specific immutable checksum:

```powershell
npm run study:index -- --source-id physics-oxford-2023 --checksum <sha256>
```

The 1,024-dimensional vector schema rejects embeddings with the wrong dimension.

## 7. Index a real past paper

Use `npm run paper:index` with explicit normalized metadata and authorized local files. Do not rely on guessed filenames.

Example:

```powershell
npm run paper:index -- `
  --question "C:\path\physics_m25_hl_tz2_p2.pdf" `
  --markscheme "C:\path\physics_m25_hl_tz2_p2_ms.pdf" `
  --subject physics `
  --year 2025 `
  --session may `
  --timezone TZ2 `
  --level HL `
  --paper p2 `
  --language English
```

Omit `--markscheme` when no authorized matching scheme is available; the questions stay `question_only`.

See `docs/PAST_PAPERS.md` for conservative pairing and visual-question rules.

## 8. Runtime access boundary

The database source schema is private. Server-only RPC execution is revoked from `PUBLIC`, `anon` and `authenticated`, and granted to the server role.

The browser never queries the private source database directly. After private retrieval is configured, `/api/chat` authenticates the Supabase user before source search begins. `/api/sources` exposes only a safe authenticated source inventory.

## Current limitations

- OCR-required pages now have an explicit private repair/apply workflow, but the repository intentionally does not force one OCR engine.
- Paper figures/graphs/diagrams are not yet extracted; visual-dependent questions are withheld from retrieval.


## ManageBac MCP handoff

For textbooks/resources already available through the student's authorized ManageBac account, the companion `DH4410/managebac-mcp` repository can discover and download class files through the saved authenticated browser session.

It deliberately does **not** pass ManageBac cookies/passwords into AI-for-IB. The boundary is a local file path:

```text
ManageBac session
  -> managebac_get_class_files
  -> opaque resourceId
  -> managebac_download_file
  -> .managebac/downloads/<sha>--<filename>
  -> AI-for-IB ingest-source.ts --input <localPath>
```

See `docs/MANAGEBAC_IMPORT.md`.
