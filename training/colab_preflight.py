#!/usr/bin/env python3
"""Report whether the current CUDA runtime is suitable for IB model benchmarking/QLoRA."""

from __future__ import annotations

import json
import platform
import shutil
from dataclasses import asdict, dataclass

import torch


@dataclass(frozen=True)
class RuntimeReport:
    cuda_available: bool
    gpu_name: str | None
    total_vram_gib: float | None
    bf16_supported: bool
    torch_version: str
    cuda_version: str | None
    python_version: str
    free_disk_gib: float
    recommendation: str
    benchmark_candidates: list[str]
    qlora_candidates: list[str]


def recommendations(vram_gib: float | None) -> tuple[str, list[str], list[str]]:
    if vram_gib is None:
        return (
            "No CUDA GPU detected. Switch Colab to a GPU runtime before benchmarking or training.",
            [],
            [],
        )

    if vram_gib < 8:
        return (
            "GPU memory is too small for the planned 4B/8B workflow. Use a larger Colab GPU.",
            [],
            [],
        )

    if vram_gib < 12:
        return (
            "Use this runtime only for a small plumbing benchmark. Do not start the 8B QLoRA run.",
            ["microsoft/Phi-4-mini-instruct"],
            [],
        )

    if vram_gib < 16:
        return (
            "Good for the 4B benchmark and likely 4B QLoRA at batch size 1 with gradient checkpointing. Treat 8B as benchmark-only unless a smoke test fits.",
            [
                "Qwen/Qwen3-4B",
                "microsoft/Phi-4-mini-instruct",
            ],
            ["Qwen/Qwen3-4B"],
        )

    if vram_gib < 24:
        return (
            "Good for sequential 4-bit benchmarking of all default candidates and 4B QLoRA. Try an 8B smoke test before a full 8B training run.",
            [
                "Qwen/Qwen3-4B",
                "Qwen/Qwen3-8B",
                "microsoft/Phi-4-mini-instruct",
            ],
            [
                "Qwen/Qwen3-4B",
                "microsoft/Phi-4-mini-instruct",
            ],
        )

    return (
        "Strong runtime for the planned sequential benchmark and QLoRA. Benchmark first; train only the best IB candidate.",
        [
            "Qwen/Qwen3-4B",
            "Qwen/Qwen3-8B",
            "microsoft/Phi-4-mini-instruct",
        ],
        [
            "Qwen/Qwen3-4B",
            "Qwen/Qwen3-8B",
            "microsoft/Phi-4-mini-instruct",
        ],
    )


def build_report() -> RuntimeReport:
    cuda_available = torch.cuda.is_available()
    gpu_name = None
    total_vram_gib = None
    bf16_supported = False

    if cuda_available:
        gpu_name = torch.cuda.get_device_name(0)
        total_vram_gib = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        bf16_supported = torch.cuda.is_bf16_supported()

    disk = shutil.disk_usage(".")
    free_disk_gib = disk.free / (1024**3)
    recommendation, benchmark_candidates, qlora_candidates = recommendations(
        total_vram_gib
    )

    return RuntimeReport(
        cuda_available=cuda_available,
        gpu_name=gpu_name,
        total_vram_gib=round(total_vram_gib, 2)
        if total_vram_gib is not None
        else None,
        bf16_supported=bf16_supported,
        torch_version=torch.__version__,
        cuda_version=torch.version.cuda,
        python_version=platform.python_version(),
        free_disk_gib=round(free_disk_gib, 2),
        recommendation=recommendation,
        benchmark_candidates=benchmark_candidates,
        qlora_candidates=qlora_candidates,
    )


def main() -> None:
    report = build_report()
    print(json.dumps(asdict(report), indent=2))


if __name__ == "__main__":
    main()
