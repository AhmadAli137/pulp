"""Similar-customer comparison: the selected account against accounts with a typical inflow within 5%.

Matching denominator is the selected account's inflow. Widens to 10% if fewer than 20 peers are found.
No occupation, salary, net worth or identity is inferred; only the official metrics are compared.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import REPO_ROOT
from .financial_profiles import get_population, shock_population

HORIZON = 6


def cohort_for(account_id: int, tol: float = 0.05) -> dict:
    pop = get_population()
    if account_id not in pop.index:
        raise KeyError(account_id)
    me = pop.loc[account_id]
    elig = pop[(pop.I > 0) & (pop.index != account_id)]
    used_tol = tol
    peers = elig[(elig.I - me.I).abs() <= tol * me.I] if me.I > 0 else elig.iloc[0:0]
    if len(peers) < 20 and me.I > 0:
        used_tol = 0.10
        peers = elig[(elig.I - me.I).abs() <= used_tol * me.I]
    lay_all = shock_population(pop, 0.55, 0.0)
    comb_all = shock_population(pop, 0.55, 0.15)
    me_lay = lay_all.loc[account_id]
    me_comb = comb_all.loc[account_id]
    if peers.empty:
        return {"account_id": int(account_id), "tolerance": used_tol, "n_peers": 0, "note": "No peers with a positive inflow within range."}
    lay = lay_all.loc[peers.index]
    comb = comb_all.loc[peers.index]

    def pct_rank(series: pd.Series, value: float) -> float:
        return float(100.0 * (series < value).mean())

    nearest = peers.assign(diff=(peers.I - me.I).abs()).sort_values(["diff"]).head(12)
    nearest_rows = [
        {"account_id": int(i), "I": float(r.I), "S": float(r.S), "B": float(r.B),
         "spending_ratio": float(r.spending_ratio) if pd.notna(r.spending_ratio) else None,
         "runway_layoff": (None if np.isinf(lay.at[i, "runway"]) else float(lay.at[i, "runway"])),
         "survives6_layoff": bool(lay.at[i, "runway"] >= HORIZON)}
        for i, r in nearest.iterrows()
    ]
    me_runway = None if np.isinf(me_lay.runway) else float(me_lay.runway)
    peer_fin = lay.runway[np.isfinite(lay.runway)]
    return {
        "account_id": int(account_id),
        "tolerance": used_tol,
        "n_peers": int(len(peers)),
        "me": {
            "I": float(me.I), "S": float(me.S), "B": float(me.B), "H": float(me.H),
            "spending_ratio": float(me.spending_ratio) if pd.notna(me.spending_ratio) else None,
            "runway_layoff": me_runway, "survives6_layoff": bool(me_lay.runway >= HORIZON),
            "survives6_combined": bool(me_comb.runway >= HORIZON),
            "buffer_months_of_spending": float(me.B / me.S) if me.S > 0 else None,
        },
        "peers": {
            "median_S": float(peers.S.median()), "median_B": float(peers.B.median()), "median_H": float(peers.H.median()),
            "median_spending_ratio": float(peers.spending_ratio.median()),
            "survive6_layoff_pct": float(100 * (lay.runway >= HORIZON).mean()),
            "survive6_combined_pct": float(100 * (comb.runway >= HORIZON).mean()),
            "median_runway_layoff_finite": float(peer_fin.median()) if len(peer_fin) else None,
            "median_buffer_months_of_spending": float((peers.B / peers.S.replace(0, np.nan)).median()),
        },
        "percentiles_within_cohort": {
            "buffer": pct_rank(peers.B, me.B),
            "spending": pct_rank(peers.S, me.S),
            "spending_ratio": pct_rank(peers.spending_ratio.dropna(), me.spending_ratio) if pd.notna(me.spending_ratio) else None,
            "runway_layoff": pct_rank(peer_fin, me_runway) if me_runway is not None else 100.0,
        },
        "nearest_peers": nearest_rows,
        "runway_distribution_layoff": _hist(peer_fin),
        "note": ("Peers are accounts whose typical inflow is within "
                 f"{int(used_tol * 100)}% of this account's (I = ${me.I:,.0f}). Simulated outcomes under the sponsor formula, not observed events."),
    }


def _hist(series: pd.Series) -> list[dict]:
    if series.empty:
        return []
    edges = [0, 2, 4, 6, 9, 12, 18, 24, 1e9]
    labels = ["0-2", "2-4", "4-6", "6-9", "9-12", "12-18", "18-24", "24+"]
    counts = np.histogram(series.to_numpy(), bins=edges)[0]
    return [{"bucket": l, "n": int(c)} for l, c in zip(labels, counts)]


@lru_cache(maxsize=1)
def research_summary() -> dict:
    """Findings produced by scripts/analyze_population.py. Regenerate with that script."""
    p = REPO_ROOT / "docs" / "findings.json"
    if not p.exists():
        return {"available": False, "note": "Run python backend/scripts/analyze_population.py to generate docs/findings.json"}
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    data["available"] = True
    pop = data["population"]
    prim = data["runs"]["primary_5pct_layoff"]
    qb = data["survival_by_quartile"]["buffer_B"]
    qs = data["survival_by_quartile"]["spending_ratio_S_over_I"]
    data["headline"] = (
        f"Across {data['accounts_eligible_positive_inflow']:,} accounts hit by the same six-month, 55%-income layoff, "
        f"the size of the cash buffer barely predicts who makes it ({qb[0]['survive6_pct']:.0f}% of the lowest-buffer quartile lasts six months versus "
        f"{qb[3]['survive6_pct']:.0f}% of the highest), while the spending-to-income ratio decides it "
        f"({qs[0]['survive6_pct']:.0f}% in the leanest quartile versus {qs[3]['survive6_pct']:.0f}% in the heaviest). "
        f"In {prim['reversals']} of {prim['pairs_unequal_buffer']:,} matched pairs with near-identical inflows ({prim['reversal_pct_of_pairs']:.1f}%), "
        f"the account with more cash runs out first."
    )
    data["opening_sentence"] = (
        f"We matched {prim['pairs_unequal_buffer']:,} pairs of accounts with near-identical inflows and hit both with the same layoff: "
        f"in {prim['reversals']} pairs the account with more cash ran out first, and across all {data['accounts_eligible_positive_inflow']:,} accounts "
        f"the buffer quartile told us almost nothing (rank correlation {pop['spearman_buffer_vs_runway_layoff']:.2f}) while the spending-to-income "
        f"ratio told us almost everything (rank correlation {pop['spearman_spendratio_vs_runway_layoff']:.2f})."
    )
    return data
