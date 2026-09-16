from pathlib import Path
import json
import tempfile
import unittest

from training.compare_adapter import (
    aggregate_results,
    comparison_delta,
    validate_adapter_base,
)


class AdapterComparisonHelpersTest(unittest.TestCase):
    def test_validates_adapter_base_model_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "adapter_config.json").write_text(
                json.dumps(
                    {
                        "base_model_name_or_path":
                            "Qwen/Qwen3-4B-Instruct-2507"
                    }
                ),
                encoding="utf-8",
            )

            self.assertEqual(
                validate_adapter_base(
                    path,
                    "Qwen/Qwen3-4B-Instruct-2507",
                ),
                "Qwen/Qwen3-4B-Instruct-2507",
            )
            with self.assertRaisesRegex(
                ValueError,
                "different base model",
            ):
                validate_adapter_base(
                    path,
                    "Qwen/Qwen3-8B",
                )

    def test_summarizes_base_adapter_delta(self):
        base = aggregate_results(
            [
                {
                    "latencySeconds": 2.0,
                    "mechanical": {
                        "conceptCoverage": 0.5,
                        "guardrailsPassed": True,
                    },
                }
            ]
        )
        adapter = aggregate_results(
            [
                {
                    "latencySeconds": 2.5,
                    "mechanical": {
                        "conceptCoverage": 0.75,
                        "guardrailsPassed": True,
                    },
                }
            ]
        )

        self.assertEqual(
            comparison_delta(base, adapter),
            {
                "conceptCoverage": 0.25,
                "guardrailPassRate": 0.0,
                "latencySeconds": 0.5,
            },
        )


if __name__ == "__main__":
    unittest.main()
