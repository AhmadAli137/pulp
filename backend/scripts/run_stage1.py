"""Stage 1 offline run: features -> archetypes (Gemini names) -> Pattern Hunter (Gemini on ADK) -> data/derived/.

Run from the repo root or backend/ with the Gemini key in .env:
    python backend/scripts/run_stage1.py            # full run, writes data/derived/archetypes.json and hunter_findings.json
    python backend/scripts/run_stage1.py --no-ai    # rule names + deterministic battery only
The committed artefacts are what the API serves; without them it computes the offline versions at startup.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import config  # noqa: E402
from app.services.archetypes import build_archetypes, save_archetypes  # noqa: E402
from app.services.features import flag_matrix, get_features  # noqa: E402
from app.services.hunter import baseline_battery, run_hunter, save_findings  # noqa: E402
from app.services.adk_runtime import adk_available  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-ai", action="store_true")
    ap.add_argument("--out", default=str(config.REPO_ROOT / "data" / "derived"))
    ap.add_argument("--k", type=int, default=6)
    ap.add_argument("--budget", type=int, default=28)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    use_ai = not args.no_ai and adk_available()
    print(f"AI roles: {'on (' + config.GEMINI_MODEL + ')' if use_ai else 'off'}")

    t = time.perf_counter()
    f = get_features()
    fm = flag_matrix(f)
    print(f"features: {f.shape[0]} accounts x {f.shape[1]} columns in {time.perf_counter() - t:.1f}s")
    print("flag prevalence:", {k: round(float(v), 3) for k, v in fm.mean().sort_values(ascending=False).items()})
    f.to_csv(out / "features.csv")

    t = time.perf_counter()
    arch = build_archetypes(f, k=args.k, use_ai=use_ai)
    save_archetypes(arch, out / "archetypes.json")
    print(f"archetypes ({arch['naming_source']}) in {time.perf_counter() - t:.1f}s:")
    for c in arch["clusters"]:
        print(f"  {c['id']} {c['size']:>5} {c['survive6_layoff_pct']:5.1f}%  {c['name']}  [{c['likely_life_stage']} / {c['likely_occupation']} @ {c['confidence']:.2f}]")

    t = time.perf_counter()
    base = baseline_battery(f)
    print(f"baseline battery: {len(base['findings'])} findings in {time.perf_counter() - t:.1f}s; best: {base['best_finding']}")
    doc = base
    if use_ai:
        try:
            t = time.perf_counter()
            doc = run_hunter(f, budget=args.budget)
            doc["baseline_findings"] = base["findings"]
            print(f"pattern hunter: {doc['tool_calls_made']} tool calls, {len(doc['findings'])} findings in {doc['seconds']}s")
            for fd in doc["findings"]:
                print(f"  [{fd['strength']}] {fd['title']}")
            print("  summary:", doc.get("summary"))
        except Exception as exc:
            print(f"pattern hunter failed ({type(exc).__name__}: {exc}); keeping the baseline battery")
            doc = base
    save_findings(doc, out / "hunter_findings.json")
    print("wrote", out / "archetypes.json", "and", out / "hunter_findings.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
