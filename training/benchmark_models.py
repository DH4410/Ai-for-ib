#!/usr/bin/env python3
"""Sequential low-VRAM benchmark for candidate open-weight IB tutor models."""

from __future__ import annotations

import argparse
import gc
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


@dataclass(frozen=True)
class Candidate:
    model_id: str
    label: str
    license: str
    trust_remote_code: bool
    enable_thinking: bool | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--benchmark",
        required=True,
        help="Private rubric-based held-out benchmark JSONL",
    )
    parser.add_argument(
        "--candidates",
        default="training/model-candidates.json",
        help="Public candidate metadata JSON",
    )
    parser.add_argument(
        "--models",
        help="Optional comma-separated model ids overriding enabled defaults",
    )
    parser.add_argument(
        "--output",
        default="training/outputs/base-model-benchmark.json",
        help="Private report path under training/outputs/",
    )
    parser.add_argument("--max-cases", type=int, default=0)
    parser.add_argument("--max-new-tokens", type=int, default=512)
    return parser.parse_args()


def assert_private_output(path_value: str) -> Path:
    root = (Path.cwd() / "training" / "outputs").resolve()
    output = (Path.cwd() / path_value).resolve()

    try:
        output.relative_to(root)
    except ValueError as error:
        raise ValueError("benchmark output must be under training/outputs/") from error

    if output == root:
        raise ValueError("benchmark output must be a file")

    return output


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                case = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"invalid benchmark JSON on line {line_number}"
                ) from error

            if not isinstance(case.get("prompt"), list):
                raise ValueError(
                    f"benchmark case on line {line_number} has no prompt"
                )
            if not isinstance(case.get("rubric"), dict):
                raise ValueError(
                    f"benchmark case on line {line_number} has no rubric"
                )
            cases.append(case)

    if not cases:
        raise ValueError("benchmark dataset is empty")

    return cases


def load_candidates(
    path: Path,
    model_override: str | None,
) -> list[Candidate]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_candidates = payload.get("candidates", [])
    known = {
        item["id"]: item
        for item in raw_candidates
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }

    if model_override:
        requested_ids = [
            value.strip()
            for value in model_override.split(",")
            if value.strip()
        ]
        if not requested_ids:
            raise ValueError("--models did not contain a model id")
    else:
        requested_ids = [
            item["id"]
            for item in raw_candidates
            if item.get("enabledByDefault") is True
        ]

    result: list[Candidate] = []
    for model_id in requested_ids:
        metadata = known.get(model_id, {})
        result.append(
            Candidate(
                model_id=model_id,
                label=str(metadata.get("label", model_id)),
                license=str(metadata.get("license", "unknown")),
                trust_remote_code=bool(
                    metadata.get("trustRemoteCode", False)
                ),
                enable_thinking=(
                    bool(metadata["enableThinking"])
                    if "enableThinking" in metadata
                    else None
                ),
            )
        )

    return result


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def score_response(text: str, rubric: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize(text)
    groups = rubric.get("requiredConceptGroups", [])
    matched = 0

    for group in groups:
        if any(normalize(str(phrase)) in normalized for phrase in group):
            matched += 1

    forbidden_phrases = [
        str(phrase) for phrase in rubric.get("forbiddenPhrases", [])
    ]
    forbidden_hits = [
        phrase
        for phrase in forbidden_phrases
        if normalize(phrase) in normalized
    ]
    word_count = len(text.split())
    max_words = rubric.get("maxWords")
    within_word_limit = (
        max_words is None or word_count <= int(max_words)
    )
    asked_question = "?" in text
    requires_question = bool(
        rubric.get("shouldAskLearnerQuestion", False)
    )
    learner_question_passed = (
        not requires_question or asked_question
    )
    total = len(groups)
    concept_coverage = matched / total if total else 0.0

    return {
        "conceptGroupsMatched": matched,
        "conceptGroupsTotal": total,
        "conceptCoverage": concept_coverage,
        "forbiddenHits": forbidden_hits,
        "wordCount": word_count,
        "withinWordLimit": within_word_limit,
        "askedLearnerQuestion": asked_question,
        "learnerQuestionRequirementPassed": learner_question_passed,
        "guardrailsPassed": (
            not forbidden_hits
            and within_word_limit
            and learner_question_passed
        ),
    }


def average(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def load_model(candidate: Candidate):
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
        candidate.model_id,
        trust_remote_code=candidate.trust_remote_code,
    )
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        candidate.model_id,
        device_map="auto",
        quantization_config=quantization,
        torch_dtype=compute_dtype,
        trust_remote_code=candidate.trust_remote_code,
    )
    model.eval()

    return model, tokenizer


def generate_case(
    candidate: Candidate,
    model,
    tokenizer,
    case: dict[str, Any],
    max_new_tokens: int,
) -> tuple[str, float]:
    template_kwargs: dict[str, Any] = {}
    if candidate.enable_thinking is not None:
        template_kwargs["enable_thinking"] = (
            candidate.enable_thinking
        )

    encoded = tokenizer.apply_chat_template(
        case["prompt"],
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

    started = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            do_sample=False,
            max_new_tokens=max_new_tokens,
            pad_token_id=tokenizer.pad_token_id,
        )
    latency_seconds = time.perf_counter() - started

    generated = output[0][prompt_length:]
    text = tokenizer.decode(
        generated,
        skip_special_tokens=True,
    ).strip()

    return text, latency_seconds


def benchmark_candidate(
    candidate: Candidate,
    cases: list[dict[str, Any]],
    max_new_tokens: int,
) -> dict[str, Any]:
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()

    model = None
    tokenizer = None
    results: list[dict[str, Any]] = []

    try:
        model, tokenizer = load_model(candidate)

        for index, case in enumerate(cases, start=1):
            text, latency_seconds = generate_case(
                candidate,
                model,
                tokenizer,
                case,
                max_new_tokens,
            )
            results.append(
                {
                    "id": case.get("id", f"case-{index}"),
                    "subject": case.get("subject"),
                    "mode": case.get("mode"),
                    "text": text,
                    "latencySeconds": latency_seconds,
                    "mechanical": score_response(
                        text,
                        case["rubric"],
                    ),
                }
            )
            print(
                f"[{candidate.label}] {index}/{len(cases)} "
                f"{case.get('id', '')}"
            )

        concept_coverage = average(
            [
                result["mechanical"]["conceptCoverage"]
                for result in results
            ]
        )
        guardrail_pass_rate = average(
            [
                1.0
                if result["mechanical"]["guardrailsPassed"]
                else 0.0
                for result in results
            ]
        )
        average_latency = average(
            [result["latencySeconds"] for result in results]
        )
        peak_vram_gib = (
            torch.cuda.max_memory_allocated()
            / (1024 ** 3)
        )
        mechanical_score = (
            concept_coverage * 0.7
            + guardrail_pass_rate * 0.3
        )

        return {
            "model": candidate.model_id,
            "label": candidate.label,
            "license": candidate.license,
            "enableThinking": candidate.enable_thinking,
            "status": "completed",
            "summary": {
                "averageConceptCoverage": concept_coverage,
                "guardrailPassRate": guardrail_pass_rate,
                "averageLatencySeconds": average_latency,
                "peakAllocatedVramGiB": peak_vram_gib,
                "mechanicalSelectionScore": mechanical_score,
            },
            "cases": results,
        }
    except Exception as error:  # benchmark should continue to next model
        return {
            "model": candidate.model_id,
            "label": candidate.label,
            "license": candidate.license,
            "enableThinking": candidate.enable_thinking,
            "status": "failed",
            "error": f"{type(error).__name__}: {error}",
            "cases": results,
        }
    finally:
        if model is not None:
            del model
        if tokenizer is not None:
            del tokenizer
        gc.collect()
        torch.cuda.empty_cache()


def main() -> None:
    args = parse_args()

    if not torch.cuda.is_available():
        raise SystemExit(
            "A CUDA GPU is required. Select a GPU runtime in Colab."
        )

    benchmark_path = Path(args.benchmark)
    if not benchmark_path.is_file():
        raise SystemExit(
            f"evaluation file does not exist: {benchmark_path}"
        )

    cases = read_jsonl(benchmark_path)
    if args.max_cases > 0:
        cases = cases[: args.max_cases]

    candidates = load_candidates(
        Path(args.candidates),
        args.models,
    )
    if not candidates:
        raise SystemExit("no benchmark candidates were selected")

    output_path = assert_private_output(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    reports = [
        benchmark_candidate(
            candidate,
            cases,
            args.max_new_tokens,
        )
        for candidate in candidates
    ]
    completed = [
        report
        for report in reports
        if report["status"] == "completed"
    ]
    ranking = sorted(
        completed,
        key=lambda report: (
            -report["summary"]["mechanicalSelectionScore"],
            report["summary"]["averageLatencySeconds"],
        ),
    )

    output = {
        "generatedAtUnix": int(time.time()),
        "evaluationCaseCount": len(cases),
        "warning": (
            "Mechanical scores are a screening tool only. "
            "Review correctness, IB appropriateness and pedagogy manually "
            "before choosing a base model."
        ),
        "ranking": [
            {
                "model": report["model"],
                "label": report["label"],
                **report["summary"],
            }
            for report in ranking
        ],
        "models": reports,
    }
    output_path.write_text(
        json.dumps(output, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote private benchmark: {output_path}")
    if ranking:
        print(
            "Mechanical front-runner: "
            f"{ranking[0]['label']} "
            f"({ranking[0]['summary']['mechanicalSelectionScore']:.3f})"
        )


if __name__ == "__main__":
    main()
