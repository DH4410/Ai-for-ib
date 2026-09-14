import importlib.util
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path("training/colab_preflight.py")
SPEC = importlib.util.spec_from_file_location(
    "colab_preflight",
    MODULE_PATH,
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ColabPreflightRecommendationsTest(unittest.TestCase):
    def test_requires_gpu_for_training(self):
        message, benchmark, qlora = MODULE.recommendations(None)
        self.assertIn("No CUDA GPU", message)
        self.assertEqual(benchmark, [])
        self.assertEqual(qlora, [])

    def test_keeps_8b_training_for_large_vram(self):
        _message, benchmark, qlora = MODULE.recommendations(
            24.0,
        )
        self.assertIn("Qwen/Qwen3-8B", benchmark)
        self.assertIn("Qwen/Qwen3-8B", qlora)

    def test_12_gib_runtime_stays_on_4b_training(self):
        _message, benchmark, qlora = MODULE.recommendations(
            12.0,
        )
        self.assertIn("Qwen/Qwen3-4B", benchmark)
        self.assertIn("Qwen/Qwen3-4B", qlora)
        self.assertNotIn("Qwen/Qwen3-8B", qlora)


if __name__ == "__main__":
    unittest.main()
