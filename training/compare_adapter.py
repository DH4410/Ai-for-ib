#!/usr/bin/env python3
"""Compare a base model with a saved LoRA adapter on the same private benchmark."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument(
        "--benchmark",
        required=True,
        help="Private rubric-based held-out benchmark JSONL",
    )
    parser.add_argument(
        "--candidates",
        default="training/model-candidates.json",
    )
    parser.add_argument(
        "--output",
        default="training/outputs/adapter-comparison.json",
    )
    parser.add_argument("--max-cases", type=int, default=0)
    parser.add_argument(
        "--max-new-tokens",
        type=int,
        default=512,
    )
    return parser.parse_args()


def validate_adapter_base(
    adapter_path: Path,
    base_model: str,
) -> str:
    config_path = adapter_path / "adapter_config.json"
    if not config_path.is_file():
        raise ValueError(
            f"adapter_config.json not found under: {adapter_path}"
        )

    payload = json.loads(
        config_path.read_text(encoding="utf-8")
    )
    recorded = payload.get("base_model_name_or_path")
    if not isinstance(recorded, str) or not recorded.strip():
        raise ValueError(
            "adapter_config.json has no base_model_name_or_path"
        )

    if recorded.rstrip("/") != base_model.rstrip("/"):
        raise ValueError(
            "adapter was trained for a different base model: "
            f"{recorded} != {base_model}"
        )

    return recorded


def aggregate_results(
    results: list[dict[str, Any]],
) -> dict[str, float]:
    if not results:
        return {
            "averageConceptCoverage": 0.0,
            "guardrailPassRate": 0.0,
            "averageLatencySeconds": 0.0,
        }

    concept_coverage = sum(
        result["mechanical"]["conceptCoverage"]
        for result in results
    ) / len(results)
    guardrail_pass_rate = sum(
        1.0
        if result["mechanical"]["guardrailsPassed"]
        else 0.0
        for result in results
    ) / len(results)
    latency = sum(
        float(result["latencySeconds"])
        for result in results
    ) / len(results)

    return {
        "averageConceptCoverage": concept_coverage,
        "guardrailPassRate": guardrail_pass_rate,
        "averageLatencySeconds": latency,
    }


def classify_case(
    base_mechanical: dict[str, Any],
    adapter_mechanical: dict[str, Any],
) -> str:
    base_coverage = float(
        base_mechanical["conceptCoverage"]
    )
    adapter_coverage = float(
        adapter_mechanical["conceptCoverage"]
    )
    base_guardrails = bool(
        base_mechanical["guardrailsPassed"]
    )
    adapter_guardrails = bool(
        adapter_mechanical["guardrailsPassed"]
    )

    if (
        (base_guardrails and not adapter_guardrails)
        or adapter_coverage < base_coverage
    ):
        return "regression"

    if (
        (not base_guardrails and adapter_guardrails)
        or adapter_coverage > base_coverage
    ):
        return "improvement"

    return "neutral"


def comparison_delta(
    base: dict[str, float],
    adapter: dict[str, float],
) -> dict[str, float]:
    return {
        "conceptCoverage":
            adapter["averageConceptCoverage"]
            - base["averageConceptCoverage"],
        "guardrailPassRate":
            adapter["guardrailPassRate"]
            - base["guardrailPassRate"],
        "latencySeconds":
            adapter["averageLatencySeconds"]
            - base["averageLatencySeconds"],
    }


def main() -> None:
    args = parse_args()

    import torch
    from peft import PeftModel

    from benchmark_models import (
        assert_private_output,
        generate_case,
        load_candidates,
        load_model,
        read_jsonl,
        score_response,
    )

    if not torch.cuda.is_available():
        raise SystemExit(
            "A CUDA GPU is required. Select a GPU runtime in Colab."
        )

    adapter_path = Path(args.adapter)
    if not adapter_path.is_dir():
        raise SystemExit(
            f"adapter directory does not exist: {adapter_path}"
        )
    validate_adapter_base(
        adapter_path,
        args.base_model,
    )

    benchmark_path = Path(args.benchmark)
    if not benchmark_path.is_file():
        raise SystemExit(
            f"benchmark file does not exist: {benchmark_path}"
        )
    cases = read_jsonl(benchmark_path)
    if args.max_cases > 0:
        cases = cases[: args.max_cases]

    candidate = load_candidates(
        Path(args.candidates),
        args.base_model,
    )[0]
    output_path = assert_private_output(
        args.output,
    )
    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    model, tokenizer = load_model(candidate)

    def run(label: str, active_model) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for index, case in enumerate(cases, start=1):
            text, latency_seconds = generate_case(
                candidate,
                active_model,
                tokenizer,
                case,
                args.max_new_tokens,
            )
            results.append(
                {
                    "id": case.get(
                        "id",
                        f"case-{index}",
                    ),
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
                f"[{label}] {index}/{len(cases)} "
                f"{case.get('id', '')}"
            )
        return results

    with torch.inference_mode():
        base_results = run("base", model)

    adapter_model = PeftModel.from_pretrained(
        model,
        str(adapter_path),
    )
    adapter_model.eval()

    with torch.inference_mode():
        adapter_results = run(
            "adapter",
            adapter_model,
        )

    base_summary = aggregate_results(base_results)
    adapter_summary = aggregate_results(
        adapter_results,
    )

    paired_cases = []
    for benchmark_case, base_case, adapter_case in zip(
        cases,
        base_results,
        adapter_results,
        strict=True,
    ):
        classification = classify_case(
            base_case["mechanical"],
            adapter_case["mechanical"],
        )
        paired_cases.append(
            {
                "id": base_case["id"],
                "subject": base_case["subject"],
                "mode": base_case["mode"],
                "prompt": benchmark_case.get("prompt"),
                "rubric": benchmark_case.get("rubric"),
                "classification": classification,
                "reviewPriority":
                    "high"
                    if classification == "regression"
                    else "standard",
                "base": base_case,
                "adapter": adapter_case,
            }
        )

    classification_counts = {
        label: sum(
            1
            for case in paired_cases
            if case["classification"] == label
        )
        for label in (
            "regression",
            "neutral",
            "improvement",
        )
    }
    manual_review_queue = [
        case["id"]
        for case in sorted(
            paired_cases,
            key=lambda case: (
                0
                if case["classification"]
                == "regression"
                else 1,
                case["id"],
            ),
        )
    ]

    output = {
        "baseModel": args.base_model,
        "adapter": str(adapter_path),
        "benchmarkCaseCount": len(cases),
        "warning": (
            "Mechanical metrics are screening aids only. "
            "Review correctness, IB appropriateness and pedagogy "
            "before promoting the adapter."
        ),
        "summary": {
            "base": base_summary,
            "caseClassifications":
                classification_counts,
            "adapter": adapter_summary,
            "deltaAdapterMinusBase": comparison_delta(
                base_summary,
                adapter_summary,
            ),
        },
        "manualReviewQueue": manual_review_queue,
        "cases": paired_cases,
    }
    output_path.write_text(
        json.dumps(output, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"Wrote private adapter comparison: {output_path}"
    )
    print(
        json.dumps(
            output["summary"],
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
