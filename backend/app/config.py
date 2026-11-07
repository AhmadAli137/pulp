"""Runtime configuration. Reads .env from the repo root if present."""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    _ROOT = Path(__file__).resolve().parents[2]
    load_dotenv(_ROOT / ".env")
except Exception:  # pragma: no cover - dotenv optional
    _ROOT = Path(__file__).resolve().parents[2]

REPO_ROOT = _ROOT


def find_data_dir() -> Path:
    """Locate the folder with the Tangerine CSVs.

    Order: EVERPATH_DATA_DIR env var, ./data (if it has monthly_summary.csv),
    then any ./data-*/data folder (Google Drive export naming).
    """
    env = os.environ.get("PULP_DATA_DIR") or os.environ.get("EVERPATH_DATA_DIR")
    if env:
        p = Path(env)
        if (p / "monthly_summary.csv").exists():
            return p
        raise FileNotFoundError(f"EVERPATH_DATA_DIR={env} has no monthly_summary.csv")
    cand = REPO_ROOT / "data"
    if (cand / "monthly_summary.csv").exists():
        return cand
    for d in sorted(REPO_ROOT.glob("data-*")):
        inner = d / "data"
        if (inner / "monthly_summary.csv").exists():
            return inner
        if (d / "monthly_summary.csv").exists():
            return d
    raise FileNotFoundError(
        "Could not find the Tangerine CSVs. Put them in ./data or set EVERPATH_DATA_DIR."
    )


GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash").strip()
STORAGE_DIR = Path(__file__).resolve().parent / "storage" / "context"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Scenario constants used across the engine (documented assumptions)
DEFAULT_HORIZON_MONTHS = 6
RUNWAY_CAP_MONTHS = 120.0
EI_REPLACEMENT_RATE = 0.55  # Challenge assumption, not a determination of EI eligibility.
GEMINI_LIVE_MODEL = os.environ.get("GEMINI_LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
