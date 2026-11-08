"""Isolated local API and production frontend for browser regression tests."""
import os
import sys
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[2]
os.chdir(root)
sys.path.insert(0, str(root / "backend"))
for name in ("GEMINI_API_KEY", "VULTR_INFERENCE_API_KEY", "KV_REST_API_URL", "KV_REST_API_TOKEN"):
    os.environ[name] = ""
os.environ["AI_PROVIDER"] = "offline"
with tempfile.TemporaryDirectory(prefix="pulp-browser-") as storage:
    os.environ["PULP_STORAGE_DIR"] = storage
    import uvicorn
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")
