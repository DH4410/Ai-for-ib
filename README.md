# AI for IB

AI for IB is a private, standalone tutor for **IB Physics, Chemistry and Mathematics AA**. The browser talks to this app's own API; the API can use licensed/private study sources and a self-hosted open-weight model. It is not coupled to the ChatGPT product.

## What is implemented

- Physics, Chemistry and Mathematics workspaces with **Learn**, **Practice**, **Mark my work** and **Revise** modes.
- **Simple / Standard / Full** explanation depth plus a **Hints first** practice switch.
- A self-hosted OpenAI-compatible model adapter and a mock development model.
- Auth-gated private retrieval: once licensed sources are configured, the tutor validates the Supabase session **before** any source search runs.
- Hybrid lexical + vector retrieval with citation metadata only returned to the browser.
- A 93-node IB taxonomy covering current Physics/Chemistry section structures and the applicable Mathematics AA course structure.
- A safe, authenticated **Source Library** showing indexed source names/counts without paths, raw text or provider credentials.
- Structured real-past-paper retrieval with year/paper/topic filters.
- Conservative question/markscheme pairing: missing schemes stay `question_only`; ambiguous matches are never guessed.
- Visual-dependent real-paper questions can be used for practice with an authenticated link to the exact original private PDF page. They are explicitly flagged as visual-required and cannot enter text-only marking until a verified vision path exists.
- Magic-link sign-in and private learner progress.
- Deterministic mastery updates, spaced review dates, confidence/hint evidence and recurring mistake tags.
- Saved mastery/mistakes personalize future tutor prompts without overriding source evidence or official marking criteria.
- Private PDF materialization, checksums, page-aware extraction, OCR-required detection, chunking and topic classification.
- One-command private textbook indexing and one-command authorized local past-paper indexing.
- A **ManageBac resource bridge** through the companion `DH4410/managebac-mcp` server: discover class files, download a previously discovered resource into ignored local storage, then hand only the local path to AI-for-IB ingestion.
- Colab-ready QLoRA training with a guided notebook, GPU/stack preflight, deterministic SFT train/validation splitting, held-out benchmark leakage checks, token/step planning and syllabus-diversity diagnostics.
- Sequential 4-bit base-model benchmarking for Qwen3-4B-Instruct-2507, Qwen3-8B and Phi-4-mini-instruct, plus direct base-vs-LoRA adapter comparison.
- Conservative adapter promotion gating: mechanical regressions are surfaced first and a private side-by-side human-review page is required for correctness, pedagogy and IB relevance checks.
- Safe project-readiness reporting for source ingestion/indexing, OCR-required pages and private training/benchmark inputs.
- CI for the private-data boundary, tests, TypeScript, Python syntax and production build.

## Architecture

```text
Browser / phone
      |
      +--> Supabase Auth (publishable key only)
      |
      v
Next.js app
      |
      +--> /api/chat
      |      |-- validate request/session
      |      |-- load learner mastery
      |      |-- private cited retrieval
      |      '-- self-hosted model endpoint
      |
      +--> /api/progress
      |      '-- private attempts/mastery
      |
      +--> /api/sources
             '-- safe source inventory only

Private Supabase schema
  |-- licensed source text/chunks
  |-- structured past papers/markschemes
  '-- learner state
```

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

For UI/API development without a GPU server:

```env
USE_MOCK_MODEL=true
```

The production model path is:

```env
MODEL_BASE_URL=http://localhost:8000/v1
MODEL_NAME=Dima-IB-Tutor-v1
MODEL_API_KEY=
```

Optional hybrid embeddings:

```env
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=
```

## Dedicated Supabase project

Do **not** point this repository at an unrelated Supabase project. Use a dedicated AI-for-IB project, apply `supabase/migrations/20260913000000_private_study_foundation.sql`, then configure:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` is server-only. The legacy `SUPABASE_SERVICE_ROLE_KEY` remains a fallback while migrating existing setups.

Once private study sources are configured, user authentication is required before `/api/chat` can access them.

## Private study material

Licensed textbooks, papers, markschemes, extracted text, page images, private training/validation/benchmark data, model weights and credentials must never be committed to this public repository.

Relevant ignored paths include:

```text
private-sources/
private-index/
data/source-manifest.jsonl
data/ingestion-reports/
training/private-data/
training/outputs/
models/
```

Before committing:

```bash
npm run verify:private
```

Once private inputs exist, a metadata-only readiness report is available with:

```bash
npm run project:readiness
```

For model work, use the guided `training/AI_for_IB_Colab.ipynb` notebook rather than assembling the training commands manually.

See `docs/INGESTION.md`, `docs/PAST_PAPERS.md`, `docs/MODEL_SERVING.md` and `training/README.md` for the operational workflows.

## What still requires real private inputs/infrastructure

The code path is built, but the repository intentionally does not contain the user's licensed PDFs, real past-paper text, private behavior-training/validation/benchmark datasets, Supabase credentials, or model weights. To make the tutor fully useful, those must be supplied through the authorized private workflows and the selected model must be benchmarked, fine-tuned only if it helps, reviewed, and deployed.


## ManageBac class-file handoff

The companion `DH4410/managebac-mcp` server now exposes:

```text
managebac_get_class_files
managebac_download_file
```

The download tool accepts only an opaque resource ID returned by the class-file listing in the same MCP session. It does not accept arbitrary URLs and stores files only under the MCP repo's ignored `.managebac/downloads/` directory.

See `docs/MANAGEBAC_IMPORT.md` for the end-to-end private handoff into this repository.
