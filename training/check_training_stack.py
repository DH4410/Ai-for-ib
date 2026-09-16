#!/usr/bin/env python3
"""Fail fast when the installed Colab training stack does not match the repo contract."""

from __future__ import annotations

import inspect
import json
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


REQUIRED_TRAINER_PARAMETERS = {
    "eval_dataset",
    "peft_config",
    "processing_class",
    "quantization_config",
}
REQUIRED_SFT_CONFIG_PARAMETERS = {
    "completion_only_loss",
    "max_length",
    "trust_remote_code",
}


def pinned_versions(
    requirements_path: Path,
) -> dict[str, str]:
    result: dict[str, str] = {}

    for raw_line in requirements_path.read_text(
        encoding="utf-8"
    ).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line:
            raise ValueError(
                f"training requirement is not exactly pinned: {line}"
            )
        name, pinned = line.split("==", 1)
        result[name.strip()] = pinned.strip()

    return result


def installed_versions(
    expected: dict[str, str],
) -> dict[str, str]:
    found: dict[str, str] = {}
    for package in expected:
        try:
            found[package] = version(package)
        except PackageNotFoundError as error:
            raise RuntimeError(
                f"required training package is not installed: {package}"
            ) from error
    return found


def missing_parameters(
    callable_object,
    required: set[str],
) -> list[str]:
    parameters = set(
        inspect.signature(callable_object).parameters
    )
    return sorted(required.difference(parameters))


def main() -> None:
    requirements_path = Path(
        "training/requirements-colab.txt"
    )
    expected = pinned_versions(
        requirements_path,
    )
    installed = installed_versions(expected)

    mismatches = {
        package: {
            "expected": expected[package],
            "installed": installed[package],
        }
        for package in expected
        if expected[package] != installed[package]
    }
    if mismatches:
        raise SystemExit(
            "Installed training versions do not match the pinned "
            f"stack:\n{json.dumps(mismatches, indent=2)}"
        )

    from trl import SFTConfig, SFTTrainer

    missing_trainer = missing_parameters(
        SFTTrainer.__init__,
        REQUIRED_TRAINER_PARAMETERS,
    )
    missing_config = missing_parameters(
        SFTConfig.__init__,
        REQUIRED_SFT_CONFIG_PARAMETERS,
    )

    if missing_trainer or missing_config:
        raise SystemExit(
            "Installed TRL API does not match the training runner:\n"
            + json.dumps(
                {
                    "missingSFTTrainerParameters":
                        missing_trainer,
                    "missingSFTConfigParameters":
                        missing_config,
                },
                indent=2,
            )
        )

    # Import the concrete integration classes used by the QLoRA runner.
    from datasets import load_dataset  # noqa: F401
    from peft import LoraConfig, PeftModel  # noqa: F401
    from transformers import (
        AutoModelForCausalLM,  # noqa: F401
        AutoTokenizer,  # noqa: F401
        BitsAndBytesConfig,  # noqa: F401
    )
    import accelerate  # noqa: F401
    import bitsandbytes  # noqa: F401

    print(
        json.dumps(
            {
                "status": "compatible",
                "versions": installed,
                "sftTrainerParametersVerified": sorted(
                    REQUIRED_TRAINER_PARAMETERS
                ),
                "sftConfigParametersVerified": sorted(
                    REQUIRED_SFT_CONFIG_PARAMETERS
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
