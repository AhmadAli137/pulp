"""Vercel entrypoint: exposes the FastAPI app as a Python serverless function.

Vercel routes every /api/* request here (see vercel.json rewrites); FastAPI keeps its own /api prefix, so the
original path is matched unchanged. The dataset is read from ./data (uploaded with the deployment) and
confirmed context is kept in Redis when KV_REST_API_URL/TOKEN are set, otherwise in /tmp (ephemeral).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

os.environ.setdefault("EVERPATH_DATA_DIR", str(ROOT / "data"))
if os.environ.get("VERCEL") and not os.environ.get("PULP_STORAGE_DIR"):
    os.environ["PULP_STORAGE_DIR"] = "/tmp/pulp-context"

from app.main import app  # noqa: E402  (FastAPI ASGI app; Vercel serves it)
