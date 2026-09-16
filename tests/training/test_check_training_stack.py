from pathlib import Path
import tempfile
import unittest

from training.check_training_stack import (
    missing_parameters,
    pinned_versions,
)


class TrainingStackContractTest(unittest.TestCase):
    def test_parses_exact_pins_and_rejects_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "requirements.txt"
            path.write_text(
                "# comment\ntrl==1.13.0\npeft==0.20.0\n",
                encoding="utf-8",
            )
            self.assertEqual(
                pinned_versions(path),
                {
                    "trl": "1.13.0",
                    "peft": "0.20.0",
                },
            )

            path.write_text(
                "trl>=1.13.0\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                ValueError,
                "not exactly pinned",
            ):
                pinned_versions(path)

    def test_detects_missing_callable_parameters(self):
        def compatible(
            *,
            eval_dataset=None,
            peft_config=None,
        ):
            return None

        self.assertEqual(
            missing_parameters(
                compatible,
                {
                    "eval_dataset",
                    "peft_config",
                    "quantization_config",
                },
            ),
            ["quantization_config"],
        )


if __name__ == "__main__":
    unittest.main()
