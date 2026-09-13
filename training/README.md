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

A tiny synthetic example is committed as `training/dataset.example.jsonl`. Real training and evaluation JSONL files are blocked by the repository privacy boundary.

## Validate before Colab

Keep the real file somewhere ignored, for example:

```text
training/private-data/train.jsonl
training/private-data/eval.jsonl
```

Then run:

```bash
npm run training:validate -- training/private-data/train.jsonl
npm run training:validate -- training/private-data/eval.jsonl
npm run verify:private
```

The validator checks schema, roles, duplicate IDs and coverage metadata without uploading the file.

## Google Colab workflow

### 1. Start a GPU runtime

In Colab, select a GPU runtime. Free/paid Colab hardware varies, so the base model is intentionally a command-line argument rather than hard-coded in the repository.

For the first plumbing test, use a small instruct model. After the pipeline works, benchmark stronger 3B-7B-class candidates that fit the GPU.

### 2. Clone the code and install training libraries

```bash
!git clone https://github.com/DH4410/Ai-for-ib.git
%cd Ai-for-ib
!pip install -U -r training/requirements-colab.txt
```

### 3. Mount Drive for private data/checkpoints

```python
from google.colab import drive
drive.mount("/content/drive")
```

Put `train.jsonl` and `eval.jsonl` in your own Drive, not in the Git repository.

### 4. Run QLoRA

```bash
!python training/colab_train.py \
  --base-model "<hugging-face-model-id>" \
  --train "/content/drive/MyDrive/ai-for-ib/private/train.jsonl" \
  --eval "/content/drive/MyDrive/ai-for-ib/private/eval.jsonl" \
  --output-dir "/content/drive/MyDrive/ai-for-ib/checkpoints/Dima-IB-Tutor-v1" \
  --epochs 2 \
  --learning-rate 1e-4 \
  --batch-size 1 \
  --gradient-accumulation 16 \
  --max-length 2048
```

The runner uses 4-bit NF4 quantization plus LoRA on all linear layers and saves the adapter/checkpoint outside the repository.

If a chosen model requires a Hugging Face token, enter it using Colab's secret/environment facilities. Never commit it to `.env`, a notebook cell, a JSONL file or Git.

## Evaluation rule

Do not judge the model on training loss alone.

Keep a held-out evaluation set that contains concepts and wording not duplicated from the training file. Measure at least:

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
