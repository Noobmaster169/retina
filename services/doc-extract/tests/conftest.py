import shutil
import sys
from pathlib import Path

import pytest

# The service is a flat package rooted here, as `uv run uvicorn app:app` runs it.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


needs_tesseract = pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract is not installed here")
