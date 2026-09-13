# Architecture

## Product boundary

AI for IB is a standalone study application. The browser talks to this application's API, and the API talks to a model endpoint that we control.

It is intentionally **not coupled to ChatGPT**.

## Model layer

The first implementation expects an OpenAI-compatible `/v1/chat/completions` endpoint because this protocol is supported by self-hosted inference servers such as vLLM.

That is only the wire protocol. The model itself can be an open-weight model hosted on our own GPU infrastructure.

Later:

1. benchmark suitable base models for IB Physics/Chemistry/Math;
2. build tutor/marking instruction data;
3. fine-tune with LoRA/QLoRA;
4. evaluate against a held-out IB-style benchmark;
5. deploy the selected checkpoint behind the same model API.

## Knowledge layer

Do not fine-tune textbook passages into the model as the primary knowledge strategy.

Use retrieval for:

- licensed textbooks;
- syllabus/specification documents;
- student notes;
- worked examples;
- past-paper question metadata;
- markschemes.

Planned retrieval pipeline:

```text
upload
  -> parse pages / diagrams / equations
  -> normalize metadata
  -> chunk
  -> embeddings + full-text index
  -> retrieve with subject/topic filters
  -> rerank
  -> model context
```

Each chunk needs source metadata so answers can display page/question references.

## Past papers

Questions and markschemes should be stored as structured records rather than only as PDFs.

Suggested fields:

- subject
- syllabus version
- topic/subtopic
- session/year/timezone
- paper
- question/sub-question
- marks
- command term
- question body
- required figures/assets
- markscheme criteria
- source locator

## Student model

Store learning state separately from LLM weights:

- attempts;
- scores;
- hints used;
- misconceptions;
- confidence;
- topic mastery estimates;
- spaced-repetition due dates.

This gives personalization without retraining the model after every study session.

## Security / copyright

The GitHub repository may remain public, but licensed books, papers, markschemes and model credentials must remain outside Git.

Use private object storage plus authenticated database records for source material.
