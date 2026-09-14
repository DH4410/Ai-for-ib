import importlib.util
from pathlib import Path


MODULE_PATH = Path("training/colab_preflight.py")
SPEC = importlib.util.spec_from_file_location("colab_preflight", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_recommendations_require_gpu_for_training():
    message, benchmark, qlora = MODULE.recommendations(None)
    assert "No CUDA GPU" in message
    assert benchmark == []
    assert qlora == []


def test_recommendations_keep_8b_training_for_large_vram():
    _message, benchmark, qlora = MODULE.recommendations(24.0)
    assert "Qwen/Qwen3-8B" in benchmark
    assert "Qwen/Qwen3-8B" in qlora
