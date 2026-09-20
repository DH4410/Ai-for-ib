# Model serving and deployment

The Next.js app expects a self-hosted **OpenAI-compatible** chat endpoint. The normal production variables are:

```env
MODEL_BASE_URL=https://your-model-host.example/v1
MODEL_NAME=Dima-IB-Tutor-v1
MODEL_API_KEY=
```

Do not point the app at a checkpoint until it has passed the held-out benchmark, adapter comparison, and human review workflow in `training/README.md`.

## Recommended first deployment: vLLM + the LoRA adapter

vLLM can expose a PEFT LoRA adapter as its own OpenAI-compatible model name. That means the QLoRA output does not have to be merged into the base weights just to connect it to this app.

Example:

```bash
vllm serve "<base-model-id>" \
  --enable-lora \
  --max-lora-rank 16 \
  --lora-modules '{"name":"Dima-IB-Tutor-v1","path":"/models/Dima-IB-Tutor-v1","base_model_name":"<base-model-id>"}'
```

The training runner defaults to `--lora-r 16`. If training uses another rank, set `--max-lora-rank` to that real adapter rank. Do not set it much larger without a reason because it wastes serving memory.

After startup, `/v1/models` should list both the base model and `Dima-IB-Tutor-v1`. Tutor requests should use the adapter alias as the `model`.

## Validate before connecting the app

From this repository:

```bash
npm run model:check -- \
  --base-url http://localhost:8000/v1 \
  --model Dima-IB-Tutor-v1
```

If the server requires a key, set it through the environment rather than a CLI argument:

```bash
export MODEL_API_KEY="<secret>"
npm run model:check -- \
  --base-url https://model.example/v1 \
  --model Dima-IB-Tutor-v1
```

The check:

- confirms that the configured model alias exists in `/v1/models`;
- sends a synthetic chat request containing no private study material;
- requires a non-empty response;
- rejects exposed `<think>` blocks by default;
- reports response length and latency without printing the model response.

Use `--allow-thinking` only for a deliberately separate reasoning endpoint. The normal tutor endpoint should not leak hidden reasoning text.

## Security boundary

A model server is a privileged backend. Do not expose an unrestricted inference service directly to the public internet.

vLLM's API-key option protects the OpenAI-style API paths but is **not a complete perimeter control for every server endpoint**. Put the model service on a private network or behind a hardened reverse proxy/firewall, and let only the Next.js backend reach it.

Keep:

- model API keys server-only;
- adapter/base-model storage private unless you intentionally publish it;
- training and benchmark files off the serving host unless needed;
- runtime LoRA loading disabled in production unless the environment is isolated and trusted.

## Optional merged model

PEFT also supports merging a LoRA adapter into its base model with `merge_and_unload()`, producing a standalone model. This can simplify some serving environments, but it removes PEFT adapter functionality and creates a full-size model artifact.

For the first AI-for-IB deployment, serving the reviewed adapter statically with vLLM is simpler and keeps the base/adaptor relationship explicit. Merge only when deployment constraints or measured inference performance justify it.

## Hardware note

The user's local Windows laptop is not the intended production inference host for the 4B-8B candidates. vLLM's native GPU serving path is primarily Linux-oriented; a remote Linux GPU machine is the expected deployment target. Keep local development on `USE_MOCK_MODEL=true` until a remote endpoint passes `npm run model:check`.
