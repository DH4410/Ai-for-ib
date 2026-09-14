#!/usr/bin/env python3
"""QLoRA supervised fine-tuning entry point for Google Colab/GPU runners.

The dataset is conversational prompt/completion JSONL validated by
training/schema.ts. Keep real train/eval files outside the public repository.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from datasets import Dataset, load_dataset
from peft import LoraConfig
from transformers import AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True, help="Hugging Face model id or local model path")
    parser.add_argument("--train", required=True, help="Private training JSONL")
    parser.add_argument("--eval", help="Optional private held-out evaluation JSONL")
    parser.add_argument("--output-dir", required=True, help="Where to save the LoRA adapter")
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=16)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--packing", action="store_true")
    parser.add_argument(
        "--trust-remote-code",
        action="store_true",
        help="Allow model repository custom code when the selected candidate requires it.",
    )
    return parser.parse_args()


def load_jsonl(path: str) -> Dataset:
    dataset = load_dataset("json", data_files=path, split="train")
    required = {"prompt", "completion"}
    missing = required.difference(dataset.column_names)
    if missing:
        raise ValueError(f"dataset is missing required columns: {sorted(missing)}")

    removable = [name for name in dataset.column_names if name not in required]
    return dataset.remove_columns(removable) if removable else dataset


def main() -> None:
    args = parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("A CUDA GPU is required. In Colab select a GPU runtime first.")

    train_path = Path(args.train)
    if not train_path.is_file():
        raise SystemExit(f"training file does not exist: {train_path}")

    eval_dataset = None
    if args.eval:
        eval_path = Path(args.eval)
        if not eval_path.is_file():
            raise SystemExit(f"evaluation file does not exist: {eval_path}")
        eval_dataset = load_jsonl(str(eval_path))

    train_dataset = load_jsonl(str(train_path))
    compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True,
    )

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )

    tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        trust_remote_code=args.trust_remote_code,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    training_args = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.gradient_accumulation,
        max_length=args.max_length,
        completion_only_loss=True,
        packing=args.packing,
        gradient_checkpointing=True,
        eval_strategy="epoch" if eval_dataset is not None else "no",
        save_strategy="epoch",
        save_total_limit=2,
        logging_steps=10,
        report_to="none",
        bf16=compute_dtype == torch.bfloat16,
        fp16=compute_dtype == torch.float16,
        optim="paged_adamw_8bit",
        seed=42,
        trust_remote_code=args.trust_remote_code,
    )

    trainer = SFTTrainer(
        model=args.base_model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
        quantization_config=quantization_config,
    )

    if hasattr(trainer.model, "print_trainable_parameters"):
        trainer.model.print_trainable_parameters()

    trainer.train()
    trainer.save_model(args.output_dir)
    tokenizer.save_pretrained(args.output_dir)

    print(f"Saved LoRA adapter and tokenizer metadata to: {args.output_dir}")


if __name__ == "__main__":
    main()
