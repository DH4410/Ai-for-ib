#!/usr/bin/env python3
"""Load a QLoRA adapter and run a small post-training tutoring smoke test."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)


DEFAULT_PROMPT = (
    "I keep mixing up what q, m, c and delta T mean in q = mcΔT. "
    "Help me in small steps and ask one short check question."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Safe smoke-test learner prompt.",
    )
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=220,
    )
    parser.add_argument(
        "--candidate-registry",
        default="training/model-candidates.json",
    )
    parser.add_argument(
        "--trust-remote-code",
        action="store_true",
        help="Allow model repository custom code when the selected candidate requires it.",
    )
    return parser.parse_args()


def candidate_thinking_setting(
    base_model: str,
    registry_path: Path,
) -> bool | None:
    if not registry_path.is_file():
        return None

    payload = json.loads(
        registry_path.read_text(encoding="utf-8")
    )
    for candidate in payload.get("candidates", []):
        if candidate.get("id") != base_model:
            continue
        if "enableThinking" not in candidate:
            return None
        return bool(candidate["enableThinking"])

    return None


def main() -> None:
    args = parse_args()

    if not torch.cuda.is_available():
        raise SystemExit(
            "A CUDA GPU is required for the adapter smoke test."
        )
    if args.max_new_tokens < 16:
        raise SystemExit(
            "--max-new-tokens must be at least 16"
        )

    adapter_path = Path(args.adapter)
    if not adapter_path.exists():
        raise SystemExit(
            f"adapter path does not exist: {adapter_path}"
        )

    compute_dtype = (
        torch.bfloat16
        if torch.cuda.is_bf16_supported()
        else torch.float16
    )
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        trust_remote_code=args.trust_remote_code,
    )
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        device_map="auto",
        quantization_config=quantization,
        torch_dtype=compute_dtype,
        trust_remote_code=args.trust_remote_code,
    )
    model = PeftModel.from_pretrained(
        base,
        str(adapter_path),
    )
    model.eval()

    messages = [
        {
            "role": "system",
            "content": (
                "You are an IB tutor. Explain accurately in small steps, "
                "do not invent sources, and help the learner think."
            ),
        },
        {
            "role": "user",
            "content": args.prompt,
        },
    ]
    template_kwargs: dict[str, Any] = {}
    thinking = candidate_thinking_setting(
        args.base_model,
        Path(args.candidate_registry),
    )
    if thinking is not None:
        template_kwargs["enable_thinking"] = thinking

    encoded = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
        **template_kwargs,
    )
    encoded = {
        key: value.to(model.device)
        for key, value in encoded.items()
    }
    prompt_length = encoded["input_ids"].shape[-1]

    with torch.inference_mode():
        output = model.generate(
            **encoded,
            do_sample=False,
            max_new_tokens=args.max_new_tokens,
            pad_token_id=tokenizer.pad_token_id,
        )

    generated = output[0][prompt_length:]
    text = tokenizer.decode(
        generated,
        skip_special_tokens=True,
    ).strip()

    if thinking is False and "<think>" in text.lower():
        raise SystemExit(
            "Smoke test failed: model emitted <think> content while non-thinking mode was requested."
        )
    if len(text.split()) < 8:
        raise SystemExit(
            "Smoke test failed: generated response is unexpectedly short."
        )

    print(
        json.dumps(
            {
                "baseModel": args.base_model,
                "adapter": str(adapter_path),
                "enableThinking": thinking,
                "response": text,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
