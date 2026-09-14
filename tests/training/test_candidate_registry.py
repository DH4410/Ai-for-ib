import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path("training/benchmark_models.py")
SPEC = importlib.util.spec_from_file_location(
    "benchmark_models",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None


class CandidateRegistryTest(unittest.TestCase):
    def test_qwen_candidates_explicitly_disable_default_thinking(self):
        import json

        payload = json.loads(
            Path("training/model-candidates.json").read_text(
                encoding="utf-8"
            )
        )
        qwen = [
            candidate
            for candidate in payload["candidates"]
            if candidate["id"].startswith("Qwen/Qwen3-")
        ]

        self.assertGreater(len(qwen), 0)
        self.assertTrue(
            all(
                candidate.get("enableThinking") is False
                for candidate in qwen
            )
        )


if __name__ == "__main__":
    unittest.main()
