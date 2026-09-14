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
    def test_default_small_qwen_is_updated_text_instruct_checkpoint(self):
        import json

        payload = json.loads(
            Path("training/model-candidates.json").read_text(
                encoding="utf-8"
            )
        )
        by_id = {
            candidate["id"]: candidate
            for candidate in payload["candidates"]
        }

        updated = by_id[
            "Qwen/Qwen3-4B-Instruct-2507"
        ]
        legacy = by_id["Qwen/Qwen3-4B"]
        hybrid_8b = by_id["Qwen/Qwen3-8B"]

        self.assertTrue(updated["enabledByDefault"])
        self.assertFalse(updated["trustRemoteCode"])
        self.assertNotIn("enableThinking", updated)
        self.assertFalse(legacy["enabledByDefault"])
        self.assertIs(
            hybrid_8b.get("enableThinking"),
            False,
        )


if __name__ == "__main__":
    unittest.main()
