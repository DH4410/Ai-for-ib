import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


MODULE_PATH = Path("training/smoke_adapter.py")
SPEC = importlib.util.spec_from_file_location(
    "smoke_adapter",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None


class CandidateThinkingSettingTest(unittest.TestCase):
    def test_reads_explicit_qwen_non_thinking_mode(self):
        # Import only the helper body without requiring GPU execution.
        source = MODULE_PATH.read_text(encoding="utf-8")
        namespace = {}
        helper_start = source.index(
            "def candidate_thinking_setting("
        )
        helper_end = source.index(
            "\n\ndef main()",
            helper_start,
        )
        exec(
            "from pathlib import Path\nimport json\n"
            + source[helper_start:helper_end],
            namespace,
        )

        with tempfile.TemporaryDirectory() as directory:
            registry = Path(directory) / "models.json"
            registry.write_text(
                json.dumps(
                    {
                        "candidates": [
                            {
                                "id": "Qwen/Qwen3-4B",
                                "enableThinking": False,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            self.assertIs(
                namespace["candidate_thinking_setting"](
                    "Qwen/Qwen3-4B",
                    registry,
                ),
                False,
            )


if __name__ == "__main__":
    unittest.main()
