# Model training

This directory contains the **behavior fine-tuning** path for the standalone IB tutor.

The training goal is to improve how the model teaches, hints, marks and revises. Textbooks and past-paper content remain primarily in the private retrieval system rather than being copied into model weights.

## What belongs in fine-tuning data

Good examples teach behavior such as:

- explaining in small steps;
- asking the learner to make the next move;
- giving hints before full solutions;
- marking an answer and identifying the missing mark point;
- spotting misconceptions;
- producing concise revision summaries;
- adapting explanation depth to the learner.

Every example must declare one of these origins:

- `synthetic`: deliberately created training material;
- `user-authored`: material written by the user;
- `licensed-for-training`: material whose license explicitly permits model training.

Do **not** treat normal textbook/past-paper access as permission to train on raw passages. Those sources belong in the RAG layer unless training rights are clear.

## Dataset format

Use one JSON object per line:

```json
{
  "id": "physics-guided-hint-001",
  "subject": "physics",
  "mode": "learn",
  "dataOrigin": "synthetic",
  "prompt": [
    { "role": "system", "content": "Guide the student in small steps." },
    { "role": "user", "content": "Help me understand this equation." }
  ],
  "completion": [
    { "role": "assistant", "content": "Start by identifying what each symbol represents..." }
  ],
  "tags": ["guided-hint"]
}
```

The final prompt message must be from the learner and the completion must contain exactly one assistant message. This maps cleanly to conversational prompt/completion SFT, where training loss is applied to the completion.

A 12-case synthetic behavior fixture is committed as `training/dataset.example.jsonl`. The separate rubric-based benchmark fixture is `training/benchmark.example.jsonl`. Real training, validation and benchmark files are blocked by the repository privacy boundary.

## Private dataset roles and validation

Keep three different private files when they are needed:

```text
training/private-data/train.jsonl
training/private-data/validation.jsonl
training/private-data/benchmark.jsonl
```

They have different jobs:

- `train.jsonl`: prompt + completion behavior examples used for gradient updates.
- `validation.jsonl`: optional prompt + completion examples in the **same SFT schema**, used only for validation loss/checkpoint monitoring. It is never the final quality benchmark.
- `benchmark.jsonl`: prompt + rubric cases with **no completion**, held out from SFT and used to choose the base model and compare the tuned model.

If you start from one curated prompt/completion file such as `all-behavior.jsonl`, create the SFT train/validation files deterministically:

```bash
npm run training:split-sft -- training/private-data/all-behavior.jsonl --validation-ratio 0.1
```

The splitter is stratified by subject × mode, never moves the only example out of a cell, and writes only to the ignored `training/private-data/` directory.

Validate the resulting files before Colab:

```bash
npm run training:validate -- training/private-data/train.jsonl
npm run training:validate -- training/private-data/validation.jsonl
npm run training:validate-benchmark -- training/private-data/benchmark.jsonl
npm run training:audit-split -- training/private-data/train.jsonl training/private-data/benchmark.jsonl
npm run training:topic-coverage -- training/private-data/train.jsonl training/private-data/benchmark.jsonl
npm run training:plan -- training/private-data/train.jsonl
npm run verify:private
```

Skip the validation command if you are not using a separate SFT validation file. The training-schema validator checks prompt/completion structure, roles, duplicate IDs and metadata. The benchmark validator checks the rubric-based held-out schema and coverage. The split audit checks train-vs-benchmark ID/prompt leakage and subject×mode coverage without printing private prompt text. The topic-coverage report shows which leaf IB topic IDs appear directly in the train/benchmark sets and which do not; uncovered topics are a diversity diagnostic, not a requirement to fine-tune every syllabus point. The training planner estimates token volume, likely 2,048-token truncation, effective batch size and optimizer-step count.

Never pass `benchmark.jsonl` to `colab_train.py`; it deliberately has no reference completion.

## Google Colab workflow

A guided notebook is included at `training/AI_for_IB_Colab.ipynb`. It runs the GPU preflight, public smoke benchmark, Drive setup, private benchmark, QLoRA and adapter smoke test in the correct order.

### 1. Start a GPU runtime

In Colab, select a GPU runtime. Free/paid Colab hardware varies, so the base model is intentionally a command-line argument rather than hard-coded in the repository.

After cloning/installing, run the Colab preflight before downloading large models:

```bash
!python training/colab_preflight.py
```

Paste the JSON output back into the development chat if you want the training command tuned to the exact GPU. The report contains hardware/runtime information only; it does not read or upload private training data.

For the first plumbing test, use a small instruct model. After the pipeline works, benchmark stronger 3B-7B-class candidates that fit the GPU.

### 2. Clone the code and install training libraries

```bash
!git clone https://github.com/DH4410/Ai-for-ib.git
%cd Ai-for-ib
!pip install --upgrade --no-cache-dir -r training/requirements-colab.txt
```

### 3. Mount Drive for private data/checkpoints

```python
from google.colab import drive
drive.mount("/content/drive")
```

Put `train.jsonl`, optional `validation.jsonl`, and `benchmark.jsonl` in your own Drive, not in the Git repository.

### 4. Run QLoRA

```bash
!python training/colab_train.py \
  --base-model "<hugging-face-model-id>" \
  --train "/content/drive/MyDrive/ai-for-ib/private/train.jsonl" \
  --validation "/content/drive/MyDrive/ai-for-ib/private/validation.jsonl" \
  --output-dir "/content/drive/MyDrive/ai-for-ib/checkpoints/Dima-IB-Tutor-v1" \
  --epochs 2 \
  --learning-rate 1e-4 \
  --batch-size 1 \
  --gradient-accumulation 16 \
  --max-length 2048
```

The runner uses 4-bit NF4 quantization plus LoRA on all linear layers and saves the adapter/checkpoint outside the repository.

If `microsoft/Phi-4-mini-instruct` wins the benchmark, add `--trust-remote-code` to both the QLoRA command and the later adapter smoke-test command because that candidate is explicitly marked as requiring repository custom code. Do not add this flag for models that do not require it.

If a chosen model requires a Hugging Face token, enter it using Colab's secret/environment facilities. Never commit it to `.env`, a notebook cell, a JSONL file or Git.

## Evaluation rule

Do not judge the model on training loss alone.

Keep a held-out rubric-based benchmark that contains concepts and wording not duplicated from the training file. Measure at least:

- correctness;
- IB-level relevance;
- quality of hints;
- marking precision;
- hallucination/source discipline;
- whether it reveals full answers too early;
- concise vs overlong explanations.

Only promote a checkpoint after comparing it against the unmodified base model on the same held-out set.

## Why the base model is not fixed yet

The repository has a stable model API boundary, so the best approach is to benchmark a few open-weight instruct models using the same evaluation set, then fine-tune the strongest one that fits the available GPU budget. This avoids building the whole tutor around a model name that may be a poor fit for Physics/Chemistry/Math.


## Base vs fine-tuned evaluation

Training/validation loss does not tell us whether the tutor became better. Use the private rubric-based `benchmark.jsonl` and compare the unmodified base model with the candidate model through the same OpenAI-compatible API.

A 12-case synthetic schema example is committed as `training/benchmark.example.jsonl`. Real benchmark files are private and blocked from Git.

Each case defines:

- the conversation prompt;
- required concept groups, where any phrase in a group can satisfy that concept;
- optional forbidden phrases;
- an optional word limit;
- whether the response should ask the learner a question.

The deterministic checks are intentionally limited. They are useful for comparing the same cases across two models, but final correctness and pedagogy still need human review.

Set the two model endpoints:

```bash
export EVAL_BASE_URL=http://localhost:8000/v1
export EVAL_BASE_MODEL=<base-model-name>

export EVAL_CANDIDATE_URL=http://localhost:8001/v1
export EVAL_CANDIDATE_MODEL=<fine-tuned-model-name>
```

API keys, when needed, use `EVAL_BASE_API_KEY` and `EVAL_CANDIDATE_API_KEY`.

Then run:

```bash
npm run training:evaluate -- training/private-data/benchmark.jsonl training/outputs/model-comparison.json
```

The report is forced under `training/outputs/`, which is private/ignored. It stores both responses, latency, concept coverage, word-limit checks and guardrail results. Do not publish the report if the evaluation prompts contain private study material.


## Benchmark the base model before fine-tuning

Do not choose the training base model by reputation alone. The repo includes `training/benchmark_models.py`, which sequentially loads small candidate models in 4-bit NF4 and runs the same private held-out IB benchmark against each one.

The current public candidate registry is `training/model-candidates.json`:

- `Qwen/Qwen3-4B-Instruct-2507` — Apache-2.0, primary small text-only candidate;
- `Qwen/Qwen3-4B` — Apache-2.0, retained as a non-default older hybrid reference;
- `Qwen/Qwen3-8B` — Apache-2.0;
- `microsoft/Phi-4-mini-instruct` — MIT.

These are candidates, not a predetermined winner. Hardware availability and the IB-specific held-out benchmark decide which checkpoint proceeds to QLoRA.

In Colab:

```bash
!python training/benchmark_models.py \
  --benchmark "/content/drive/MyDrive/ai-for-ib/private/benchmark.jsonl" \
  --output "training/outputs/base-model-benchmark.json"
```

For a quick plumbing run:

```bash
!python training/benchmark_models.py \
  --benchmark "/content/drive/MyDrive/ai-for-ib/private/benchmark.jsonl" \
  --max-cases 3 \
  --models "Qwen/Qwen3-4B-Instruct-2507"
```

The runner unloads each model before loading the next and reports concept coverage, guardrail pass rate, average generation latency, and peak allocated CUDA memory. The combined mechanical score is only a screening metric; manually inspect correctness and pedagogy before selecting the base model.

Gemma 3 4B remains a useful optional comparison, but its Hugging Face checkpoint requires accepting Google's Gemma terms and uses a multimodal model path, so it is intentionally not in this text-only default runner.


## Qwen3 thinking mode

Hybrid Qwen3 chat templates such as `Qwen/Qwen3-8B` enable thinking by default. The registry therefore sets `enableThinking: false` for those hybrid candidates in the normal tutor benchmark. The primary `Qwen/Qwen3-4B-Instruct-2507` candidate is already a dedicated non-thinking instruct checkpoint and does not need that switch. This prevents hidden/reasoning text from consuming the generation budget and keeps the first comparison focused on normal interactive tutoring latency and response quality.

Do not interpret this as a claim that reasoning mode is worse. If the non-thinking benchmark selects Qwen3 as a strong candidate, run a separate reasoning-focused evaluation for difficult Mathematics/Physics problems before deciding whether the deployed tutor should expose a reasoning mode.


## Post-training adapter smoke test

After QLoRA finishes, load the base model and saved adapter once before doing a longer evaluation:

```bash
!python training/smoke_adapter.py \
  --base-model "<same-base-model-used-for-training>" \
  --adapter "/content/drive/MyDrive/ai-for-ib/checkpoints/Dima-IB-Tutor-v1"
```

The smoke test verifies that the adapter can be loaded and produces a non-trivial tutoring response. For hybrid Qwen3 candidates with `enableThinking: false`, it also fails if a `<think>` block appears unexpectedly.

This is only a plumbing check. A checkpoint still has to beat the unmodified base model on the held-out private evaluation set before promotion.


## Colab dependency reproducibility

The Hugging Face/QLoRA packages in `training/requirements-colab.txt` are pinned to the versions verified for this training code. PyTorch is deliberately **not** pinned there because Colab installs a CUDA-compatible PyTorch build for the assigned runtime; replacing it blindly can break GPU compatibility.

The pinned stack is:

```text
transformers 5.17.0
datasets 5.0.1
trl 1.13.0
peft 0.20.0
accelerate 1.15.0
bitsandbytes 0.50.0
```

If this stack is intentionally upgraded later, rerun the base-model benchmark plumbing test before starting a full fine-tune.


## Initial behavior-data target

These are **starting coverage targets**, not magic minimums and not a reason to pad the dataset with low-quality examples:

- Training: about **100 strong examples per core subject × mode cell**.
  - 3 subjects × 4 modes × 100 ≈ **1,200 behavior examples**.
- Held-out benchmark: about **10 rubric cases per core subject × mode cell**.
  - 3 subjects × 4 modes × 10 ≈ **120 benchmark cases**.

The split audit reports shortfalls against these targets but does not fail because of them. Leakage still fails the audit.

Prefer fewer carefully written examples over thousands of repetitive templates. Expand the cells where the base-model benchmark and real tutoring errors show weaknesses. Raw textbook/past-paper passages remain in RAG unless training rights explicitly permit them.
