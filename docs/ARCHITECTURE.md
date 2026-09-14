# Architecture

## Product boundary

AI for IB is a standalone study application. Browser-safe code receives only a Supabase publishable key. Private database credentials, licensed source text and model credentials remain server-side.

Once a private source repository is configured, the chat route validates the learner's Supabase access token **before retrieval**. Anonymous model-only/mock development remains possible when no private repository is connected.

## Chat request path

```text
Browser
  -> /api/chat
     -> validate request
     -> if private sources configured:
          validate Supabase user
          load subject mastery + recurring mistakes
     -> apply retrieval filters
     -> textbook: lexical + optional vector search + rank fusion
        OR
        real paper: structured question search
     -> build cited + personalized tutor prompt
     -> self-hosted /v1/chat/completions
  <- answer + safe citation metadata
```

Raw private passages are never returned by the chat API. Citation responses contain only stable metadata such as source title, locator, pages, paper/year/question fields, marks and topic IDs.

## Study modes

The prompt layer supports:

- Learn;
- Practice;
- Mark my work;
- Revise;
- Simple / Standard / Full explanation depth;
- Hints-first practice.

Real-past-paper mode is strict: if no matching indexed real question exists, the API does not ask the model to invent one and label it as real.

## Knowledge layer

```text
authorized local PDF
  -> immutable private materialization + SHA-256 provenance
  -> page extraction
  -> OCR-required detection
  -> page-aware chunks
  -> IB taxonomy classification
  -> private Supabase indexing
  -> lexical/vector retrieval
  -> cited tutor context
```

The source catalog returns counts/metadata only. It never exposes source text, storage paths, signed URLs or provider credentials.

## Past papers

Papers are stored as structured question records with normalized subject, syllabus version, level, year/session/timezone, paper/component, question/subquestion, visible marks, command terms, topic classification and optional verified markscheme text.

Pairing is conservative. A record is `paired` only when the full paper identity and question locator match. Missing schemes remain `question_only`; ambiguous matches are skipped. Text that explicitly depends on a missing graph/diagram/figure is tagged `visual-context-required` and excluded from retrieval until asset rendering is implemented.

## Learner model

Learning state remains separate from LLM weights:

- attempts and scores;
- hints used;
- confidence;
- recurring mistake tags;
- mastery estimate;
- next review date.

A deterministic mastery function updates the state. The model receives only a compact summary of weak/review-due topics and recurring mistakes. The prompt explicitly prevents learner-state hints from overriding source evidence or official marking criteria.

## Model layer

The runtime speaks the OpenAI-compatible chat-completions protocol so it can use self-hosted servers such as vLLM.

Training is behavior-focused. Licensed textbook/past-paper content remains in retrieval unless separate training rights exist.

The repository includes:

1. a private dataset validator;
2. sequential low-VRAM base-model benchmarking;
3. QLoRA fine-tuning in Colab;
4. held-out base-vs-candidate evaluation.

## Database boundary

The database foundation uses a non-exposed `private` schema. Browser roles do not receive direct access to source or learner tables.

Server RPCs are `SECURITY DEFINER` only where needed to cross the private-schema boundary. Every such RPC:

- pins a trusted search path that excludes `public`;
- has execution explicitly revoked from `PUBLIC`, `anon` and `authenticated`;
- grants execution only to `service_role`;
- is reached from browser requests only through authenticated Next.js APIs.

The frontend never receives a secret/service-role key.

## Current limitations

- OCR-required pages are detected but not yet OCR-processed.
- Visual assets from paper questions are not yet extracted/rendered.
- Real source content must still be ingested privately.
- A production model checkpoint still needs to be selected by the private IB benchmark and deployed.
