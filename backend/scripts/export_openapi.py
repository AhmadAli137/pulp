"""Snapshot the API's OpenAPI document for the in-app developer docs (frontend/src/docs/openapi.json).

Run from the repository root:  python backend/scripts/export_openapi.py
Re-run after adding or changing a route; the docs page renders every path in the snapshot.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("GEMINI_API_KEY", "")  # the snapshot never needs a model

from app.main import app  # noqa: E402

out = ROOT / "frontend" / "src" / "docs" / "openapi.json"
doc = app.openapi()
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(doc, indent=1, sort_keys=False), encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)}: {len(doc.get('paths', {}))} paths")
