import os

# Never use live AI or remote context storage during automated tests.
for name in ("GEMINI_API_KEY", "VULTR_API_KEY", "VULTR_INFERENCE_API_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN"):
    os.environ[name] = ""
os.environ["AI_PROVIDER"] = "auto"

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


import pytest

@pytest.fixture(autouse=True)
def isolate_context_storage(tmp_path, monkeypatch):
    from app.services import context_manager as cm
    monkeypatch.setattr(cm, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(cm, "_KV_ENABLED", False)
