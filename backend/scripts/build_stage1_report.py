"""Write docs/stage1-report.md: the dataset-level Stage 1 report, plain language then technical.

Usage (from the repository root):  python backend/scripts/build_stage1_report.py [--account ID] [--out PATH]
Deterministic: reads the committed data and Stage 1 artefacts; calls no model.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.stage1_report import build_report, to_markdown  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--account", type=int, default=None, help="include an account section")
    ap.add_argument("--out", default=str(ROOT / "docs" / "stage1-report.md"))
    a = ap.parse_args()
    report = build_report(a.account)
    out = Path(a.out)
    out.write_text(to_markdown(report), encoding="utf-8")
    n = len(report["plain"]["sections"]) + len(report["technical"]["sections"])
    print(f"wrote {out} ({n} sections)")


if __name__ == "__main__":
    main()
