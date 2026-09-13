# AI for IB

A private, standalone AI tutor for the IB Diploma Programme.

The goal is to build a dedicated study system for **Physics, Chemistry and Mathematics** that can:

- teach syllabus topics at the right level;
- retrieve from the student's own licensed textbooks and notes;
- practise with indexed IB-style/past-paper questions;
- mark answers against markschemes;
- give hints before revealing full solutions;
- track weak areas and recurring mistakes;
- run against a **self-hosted open-weight model**, not the ChatGPT product.

## Architecture

```text
Browser / phone
      |
      v
Next.js study app
      |
      +--> Tutor API
      |       |
      |       +--> Hybrid cited retrieval
      |       +--> Student learning profile
      |       +--> Self-hosted model server
      |
      +--> Progress / practice / source library
```

The model layer uses an OpenAI-compatible HTTP protocol only as an API format, so it can point at a self-hosted server such as **vLLM**. It does not require ChatGPT.

## Current foundation

The repository now includes:

1. a standalone Next.js tutor UI with Physics, Chemistry and Mathematics workspaces;
2. learn, practice, marking and revision modes;
3. a self-hosted model adapter plus a development mock model;
4. a private-source safety boundary that keeps licensed study material out of Git;
5. local PDF materialization and page-aware extraction;
6. IB topic classification and conservative paper/markscheme pairing;
7. a private Supabase/pgvector schema and server-only source repository;
8. hybrid lexical/vector retrieval with stable citations;
9. validated source-aware chat requests and citation-only API responses;
10. tests and CI for privacy, retrieval, ingestion and API behavior;\n11. a private training-data validator and Colab-ready QLoRA fine-tuning runner.

The next product milestones are source ingestion with the user's authorized files, model benchmarking/evaluation, and the learning-progress layer. The initial Colab fine-tuning scaffold is in `training/README.md`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

For development without a GPU server, set:

```env
USE_MOCK_MODEL=true
```

## Model server

Configure a private model server:

```env
MODEL_BASE_URL=http://localhost:8000/v1
MODEL_NAME=Dima-IB-Tutor-v1
MODEL_API_KEY=
```

The retrieval layer can use a separately hosted embedding endpoint:

```env
EMBEDDING_BASE_URL=http://localhost:8001/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_API_KEY=
```

## Private study sources

Licensed textbooks, IB papers, markschemes, extracted text, page images, model weights and credentials must **never** be committed to this public repository.

Start with the metadata-only inventory in `data/source-inventory.example.json`, then follow:

- `docs/INGESTION.md` for authorized local textbook/source ingestion;
- `docs/PAST_PAPERS.md` for paper/markscheme pairing and indexing.

The local pipeline writes raw and derived study data only under ignored paths such as `private-sources/`, `private-index/`, `data/source-manifest.jsonl`, and `data/ingestion-reports/`.

Run this before any commit:

```bash
npm run verify:private
```

## Copyright / source handling

Use only study material the user is allowed to access. Download files through normal authorized access, then pass the local file to the ingestion CLI. The repository intentionally does not include automation for bypassing authentication, paywalls, CAPTCHA, access controls or provider restrictions.
