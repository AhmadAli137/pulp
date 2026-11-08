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
# Google ADK uses google-genai, which reads GEMINI_API_KEY directly; keep it on the public API, not Vertex.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
# Vultr Serverless Inference (OpenAI-compatible). Key from Vultr Console -> Compute -> Serverless Inference -> Overview.
VULTR_INFERENCE_API_KEY = os.environ.get("VULTR_INFERENCE_API_KEY", "").strip()
VULTR_INFERENCE_MODEL = os.environ.get("VULTR_INFERENCE_MODEL", "deepseek-v4.1-flash-1017").strip()
VULTR_INFERENCE_BASE_URL = os.environ.get("VULTR_INFERENCE_BASE_URL", "https://api.vultrinference.com/v1").strip()
# Which AI provider answers the companion: auto (Gemini if keyed, else Vultr if keyed, else offline) | gemini | vultr | offline
AI_PROVIDER = os.environ.get("AI_PROVIDER", "auto").strip().lower()
_storage_env = os.environ.get("PULP_STORAGE_DIR", "").strip()
STORAGE_DIR = Path(_storage_env) if _storage_env else Path(__file__).resolve().parent / "storage" / "context"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
# Optional Redis (Upstash / Vercel KV REST API) for durable context on serverless hosts.
KV_REST_API_URL = (os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL") or "").strip().rstrip("/")
KV_REST_API_TOKEN = (os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN") or "").strip()

# Scenario constants used across the engine (documented assumptions)
DEFAULT_HORIZON_MONTHS = 6
RUNWAY_CAP_MONTHS = 120.0
EI_REPLACEMENT_RATE = 0.55  # Challenge assumption, not a determination of EI eligibility.
GEMINI_LIVE_MODEL = os.environ.get("GEMINI_LIVE_MODEL", "gemini-3.8-live")
GEMINI_LIVE_API_VERSION = os.environ.get("GEMINI_LIVE_API_VERSION", "v1alpha")
