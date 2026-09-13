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
      |       +--> RAG / source retrieval
      |       +--> Student learning profile
      |       +--> Self-hosted model server
      |
      +--> Progress / practice / source library
```

The model layer uses an OpenAI-compatible HTTP protocol only as an API format, so it can point at a self-hosted server such as **vLLM**. It does not require ChatGPT.

## First milestone

This repository starts with:

1. a standalone Next.js tutor UI;
2. subject/mode selection;
3. a provider abstraction for a private model endpoint;
4. a retrieval interface ready for the IB knowledge base;
5. source-aware responses;
6. a basic health endpoint.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open http://localhost:3000.

## Model server

Configure a private model server:

```env
MODEL_BASE_URL=http://localhost:8000/v1
MODEL_NAME=your-ib-model
MODEL_API_KEY=
```

For development without a GPU server, set:

```env
USE_MOCK_MODEL=true
```

Later milestones will add document ingestion, embeddings/vector search, authentication, persistent progress, past-paper indexing and the training/fine-tuning pipeline.

## Copyright / source handling

The app is designed for private study material that the user is allowed to access. Textbooks and IB papers should not be committed to this public repository. Keep source files in private object storage and store only metadata/indexes needed by the application.
