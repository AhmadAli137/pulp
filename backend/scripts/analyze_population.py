"""Reproducible discovery analysis for the Tangerine track.

Research question: under the same income shock, how often does the account with MORE cash still run
out FIRST? Plus sensitivity checks and the "what explains runway" decomposition.

Rules (fixed before looking at outcomes):
  Eligibility : typical inflow I > 0 (median money_in). All accounts have >= 12 monthly rows;
                a sensitivity run requires >= 24 rows.
  Matching    : sort eligible accounts by I (ties by account_id). Walk the sorted list; pair adjacent
                accounts when |I_a - I_b| / max(I_a, I_b) <= tolerance (5% primary, 2% and 1% sensitivity).
                Matched accounts are never reused (greedy, deterministic). Count the unmatched.
  Scenario    : r = 0.55 (EI replacement), h = 0, one-off 0, horizon 6 months. Survive = unrounded runway >= 6
                (no-shortfall counts as survive). Combined scenario adds h = 0.15.
  Reversal    : within a pair with unequal B, the larger-B account fails 6 months while the smaller-B one survives.

Outputs: docs/findings.json (consumed by GET /api/research/summary), docs/findings_chart.png,
         and a console report. Run:  python backend/scripts/analyze_population.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.data_store import get_store  # noqa: E402
from app.services.financial_profiles import build_population_table, shock_population  # noqa: E402

HORIZON = 6


def match_pairs(pop: pd.DataFrame, tol: float) -> tuple[list[tuple[int, int]], int]:
    s = pop.copy()
    s["_id"] = s.index.to_numpy()
    s = s.sort_values(["I", "_id"])
    ids = s.index.to_numpy()
    inflow = s.I.to_numpy()
    pairs, i, unmatched = [], 0, 0
    while i < len(ids):
        if i + 1 < len(ids):
            a, b = inflow[i], inflow[i + 1]
            if abs(a - b) / max(a, b) <= tol:
                pairs.append((int(ids[i]), int(ids[i + 1])))
                i += 2
                continue
        unmatched += 1
        i += 1
    return pairs, unmatched


def reversal_stats(pop: pd.DataFrame, pairs: list[tuple[int, int]], r: float, h: float) -> dict:
    sh = shock_population(pop, r=r, h=h)
    rows = []
    for a, b in pairs:
        Ba, Bb = sh.at[a, "B"], sh.at[b, "B"]
        if Ba == Bb:
            continue
        big, small = (a, b) if Ba > Bb else (b, a)
        big_ok = sh.at[big, "runway"] >= HORIZON
        small_ok = sh.at[small, "runway"] >= HORIZON
        rows.append({
            "big": big, "small": small,
            "B_big": float(sh.at[big, "B"]), "B_small": float(sh.at[small, "B"]),
            "S_big": float(sh.at[big, "S"]), "S_small": float(sh.at[small, "S"]),
            "I_big": float(sh.at[big, "I"]), "I_small": float(sh.at[small, "I"]),
            "gap_big": float(sh.at[big, "gap"]), "gap_small": float(sh.at[small, "gap"]),
            "runway_big": float(sh.at[big, "runway"]), "runway_small": float(sh.at[small, "runway"]),
            "big_ok": bool(big_ok), "small_ok": bool(small_ok),
            "reversal": bool((not big_ok) and small_ok),
            "both_fail": bool((not big_ok) and (not small_ok)),
            "both_ok": bool(big_ok and small_ok),
            "expected": bool(big_ok and not small_ok),
        })
    df = pd.DataFrame(rows)
    Y = len(df)
    X = int(df.reversal.sum()) if Y else 0
    rev = df[df.reversal] if Y else df
    discordant = int(df.reversal.sum() + df.expected.sum()) if Y else 0
    return {
        "pairs_unequal_buffer": Y,
        "reversals": X,
        "reversal_pct_of_pairs": (100.0 * X / Y) if Y else None,
        "expected_order": int(df.expected.sum()) if Y else 0,
        "both_fail": int(df.both_fail.sum()) if Y else 0,
        "both_survive": int(df.both_ok.sum()) if Y else 0,
        "discordant_pairs": discordant,
        "reversal_pct_of_discordant": (100.0 * X / discordant) if discordant else None,
        "median_buffer_gap_in_reversals": float((rev.B_big - rev.B_small).median()) if X else None,
        "median_buffer_ratio_in_reversals": float((rev.B_big / rev.B_small).median()) if X else None,
        "median_spending_gap_in_reversals": float((rev.S_big - rev.S_small).median()) if X else None,
        "median_runway_big_in_reversals": float(rev.runway_big.median()) if X else None,
        "median_runway_small_in_reversals": float(rev.runway_small.replace(np.inf, np.nan).median()) if X else None,
        "_df": df,
    }


def pick_representative(df: pd.DataFrame) -> dict | None:
    """A reversal pair near the median buffer gap, with finite runways, preferring larger buffer differences."""
    rev = df[df.reversal & np.isfinite(df.runway_small)].copy()
    if rev.empty:
        rev = df[df.reversal].copy()
    if rev.empty:
        return None
    rev["bgap"] = rev.B_big - rev.B_small
    med = rev.bgap.median()
    rev["dist"] = (rev.bgap - med).abs()
    row = rev.sort_values(["dist", "big"]).iloc[0]
    d = row.to_dict()
    d = {k: (None if isinstance(v, float) and not np.isfinite(v) else v) for k, v in d.items()}
    return d


def runway_variance_decomposition(pop: pd.DataFrame, r: float) -> dict:
    """Among accounts with a positive gap under the shock: log(runway) = log(B) - log(gap).
    Share of variance of log-runway attributable to the buffer vs the monthly gap (with covariance term)."""
    sh = shock_population(pop, r=r, h=0.0)
    d = sh[(sh.gap > 0) & (sh.buffer_left > 0)]
    lb, lg = np.log(d.buffer_left), np.log(d.gap)
    lr = lb - lg
    v_r = lr.var(ddof=0)
    v_b = lb.var(ddof=0)
    v_g = lg.var(ddof=0)
    cov = np.cov(lb, lg, ddof=0)[0, 1]
    return {
        "n_accounts_with_shortfall": int(len(d)),
        "var_log_runway": float(v_r),
        "share_from_buffer": float(v_b / v_r),
        "share_from_gap": float(v_g / v_r),
        "share_from_covariance": float(-2 * cov / v_r),
        "corr_logB_logGap": float(np.corrcoef(lb, lg)[0, 1]),
        "note": "Var(log R) = Var(log B) + Var(log gap) - 2 Cov. Shares can exceed 1 when B and gap are positively correlated.",
    }


def main() -> dict:
    store = get_store()
    pop = build_population_table(store)
    elig = pop[pop.I > 0].copy()
    n_total, n_elig = len(pop), len(elig)

    results: dict = {
        "generated_from": str(store.data_dir),
        "accounts_total": n_total,
        "accounts_eligible_positive_inflow": n_elig,
        "accounts_excluded_zero_inflow": n_total - n_elig,
        "horizon_months": HORIZON,
        "matching_rule": "sort by I; greedy adjacent pairing with |Ia-Ib|/max(Ia,Ib) <= tol; no reuse; ties by account_id",
        "runs": {},
    }

    # --- population-level outcomes
    lay = shock_population(elig, r=0.55, h=0.0)
    comb = shock_population(elig, r=0.55, h=0.15)
    base = shock_population(elig, r=1.0, h=0.0)
    lay_ok = lay.runway >= HORIZON
    comb_ok = comb.runway >= HORIZON
    results["population"] = {
        "baseline_no_shortfall_pct": float(100 * np.isinf(base.runway).mean()),
        "baseline_shortfall_pct": float(100 * (~np.isinf(base.runway)).mean()),
        "layoff55_survive6_pct": float(100 * lay_ok.mean()),
        "layoff55_survive6_n": int(lay_ok.sum()),
        "layoff55_no_shortfall_pct": float(100 * np.isinf(lay.runway).mean()),
        "layoff55_median_runway_finite": float(lay.runway[np.isfinite(lay.runway)].median()),
        "combined_survive6_pct": float(100 * comb_ok.mean()),
        "combined_survive6_n": int(comb_ok.sum()),
        "layoff_survivors_pushed_under6_by_bills": int((lay_ok & ~comb_ok).sum()),
        "layoff_survivors_pushed_under6_by_bills_pct": float(100 * (lay_ok & ~comb_ok).sum() / max(1, lay_ok.sum())),
        "median_runway_loss_from_bills_among_pushed": float(
            (lay.runway - comb.runway)[(lay_ok & ~comb_ok) & np.isfinite(lay.runway)].median()) if (lay_ok & ~comb_ok).any() else None,
        "observed_any_negative_balance_pct": float(100 * elig.any_observed_negative.mean()),
        "observed_negative_and_fail_layoff_pct": float(100 * (elig.any_observed_negative & ~lay_ok).sum() / max(1, elig.any_observed_negative.sum())),
        "no_observed_negative_but_fail_layoff_pct": float(100 * (~elig.any_observed_negative & ~lay_ok).sum() / max(1, (~elig.any_observed_negative).sum())),
    }

    # --- Does the buffer rank predict the outcome rank? Spearman within the population.
    from scipy.stats import spearmanr
    fin = lay[np.isfinite(lay.runway)]
    results["population"]["spearman_buffer_vs_runway_layoff"] = float(spearmanr(fin.B, fin.runway).statistic)
    results["population"]["spearman_spendratio_vs_runway_layoff"] = float(
        spearmanr(elig.loc[fin.index, "spending_ratio"], fin.runway).statistic)
    results["population"]["buffer_in_months_of_spending_median"] = float((elig.B / elig.S.replace(0, np.nan)).median())

    results["variance_decomposition_layoff55"] = runway_variance_decomposition(elig, r=0.55)

    # --- survival by quartile of buffer vs quartile of spending ratio (the chartable version of the finding)
    def quartile_table(series: pd.Series, label: str) -> list[dict]:
        q = pd.qcut(series, 4, labels=["Q1 (lowest)", "Q2", "Q3", "Q4 (highest)"])
        out = []
        for lvl in q.cat.categories:
            mask = (q == lvl).to_numpy()
            out.append({"quartile": str(lvl), "n": int(mask.sum()),
                        "survive6_pct": float(100 * lay_ok[mask].mean()),
                        "median_value": float(series[mask].median())})
        return out
    results["survival_by_quartile"] = {
        "buffer_B": quartile_table(elig.B, "B"),
        "spending_ratio_S_over_I": quartile_table(elig.spending_ratio, "S/I"),
        "buffer_in_months_of_spending": quartile_table(elig.B / elig.S.replace(0, np.nan), "B/S"),
        "typical_inflow_I": quartile_table(elig.I, "I"),
    }
    bands = [(0, 0.7), (0.7, 0.8), (0.8, 0.9), (0.9, 1.0), (1.0, np.inf)]
    results["survival_by_spending_ratio_band"] = [
        {"band": f"{lo:.1f}-{hi:.1f}" if np.isfinite(hi) else f">= {lo:.1f}", "n": int(((elig.spending_ratio >= lo) & (elig.spending_ratio < hi)).sum()),
         "survive6_pct": float(100 * lay_ok[((elig.spending_ratio >= lo) & (elig.spending_ratio < hi)).to_numpy()].mean())}
        for lo, hi in bands
    ]
    results["population"]["baseline_deficit_accounts"] = int((elig.S > elig.I).sum())

    # --- matched pairs: primary + sensitivities
    rep = None
    configs = [
        ("primary_5pct_layoff", 0.05, 0.55, 0.0, 12),
        ("tight_2pct_layoff", 0.02, 0.55, 0.0, 12),
        ("tight_1pct_layoff", 0.01, 0.55, 0.0, 12),
        ("primary_5pct_combined", 0.05, 0.55, 0.15, 12),
        ("tight_2pct_combined", 0.02, 0.55, 0.15, 12),
        ("primary_5pct_layoff_min24months", 0.05, 0.55, 0.0, 24),
        ("tight_2pct_combined_min24months", 0.02, 0.55, 0.15, 24),
    ]
    for name, tol, r, h, min_months in configs:
        sub = elig[elig.months >= min_months]
        pairs, unmatched = match_pairs(sub, tol)
        st = reversal_stats(sub, pairs, r, h)
        df = st.pop("_df")
        st.update({"tolerance": tol, "r": r, "h": h, "min_months": min_months,
                   "eligible": int(len(sub)), "pairs": len(pairs), "unmatched": unmatched,
                   "pairs_equal_buffer_dropped": len(pairs) - st["pairs_unequal_buffer"]})
        if name == "primary_5pct_layoff":
            rep = pick_representative(df)
            # Decompose what explains reversals: the smaller-buffer account spends less relative to income
            rev = df[df.reversal]
            st["reversal_pairs_where_small_spends_less"] = int((rev.S_small < rev.S_big).sum())
            st["reversal_pairs_where_small_gap_smaller"] = int((rev.gap_small < rev.gap_big).sum())
            st["median_spend_ratio_big"] = float((rev.S_big / rev.I_big).median()) if len(rev) else None
            st["median_spend_ratio_small"] = float((rev.S_small / rev.I_small).median()) if len(rev) else None
        results["runs"][name] = st

    results["representative_pair"] = rep

    # --- chart for the presenter
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, (ax0, ax) = plt.subplots(1, 2, figsize=(13, 4.8), dpi=150, gridspec_kw={"width_ratios": [1.1, 1]})
        qb = results["survival_by_quartile"]["buffer_B"]
        qs = results["survival_by_quartile"]["spending_ratio_S_over_I"]
        x = np.arange(4); w = 0.38
        ax0.bar(x - w / 2, [q["survive6_pct"] for q in qb], w, color="#74817D", label="by cash buffer quartile")
        ax0.bar(x + w / 2, [q["survive6_pct"] for q in qs], w, color="#16856B", label="by spending-to-income quartile")
        ax0.set_xticks(x); ax0.set_xticklabels(["Q1 (lowest)", "Q2", "Q3", "Q4 (highest)"])
        ax0.set_ylabel("% of accounts lasting 6 months at 55% income"); ax0.set_ylim(0, 105)
        ax0.set_title(f"Who survives a six-month layoff? {len(elig):,} accounts", fontsize=11, color="#1B2623", loc="left")
        ax0.legend(frameon=False, fontsize=9)
        for s_ in ("top", "right"):
            ax0.spines[s_].set_visible(False)
        ax0.set_facecolor("#F8FAF7")
        df_primary = results["runs"]["primary_5pct_layoff"]
        cats = ["Both last 6 months", "Bigger buffer lasts,\nsmaller fails", "Both fail",
                "Smaller buffer lasts,\nBIGGER buffer fails"]
        vals = [df_primary["both_survive"], df_primary["expected_order"], df_primary["both_fail"], df_primary["reversals"]]
        colors = ["#74817D", "#74817D", "#74817D", "#D8A548"]
        bars = ax.bar(cats, vals, color=colors)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 8, f"{v:,}", ha="center", fontsize=10, color="#1B2623")
        ax.set_title(f"Same 55% income shock, {df_primary['pairs_unequal_buffer']:,} pairs of accounts with inflows within 5%",
                     fontsize=11, color="#1B2623", loc="left")
        ax.set_ylabel("Pairs")
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        ax.set_facecolor("#F8FAF7"); fig.patch.set_facecolor("#F8FAF7")
        fig.tight_layout()
        out_png = ROOT / "docs" / "findings_chart.png"
        out_png.parent.mkdir(exist_ok=True)
        fig.savefig(out_png)
        results["chart"] = str(out_png.relative_to(ROOT))
    except Exception as e:  # pragma: no cover
        results["chart_error"] = str(e)

    (ROOT / "docs").mkdir(exist_ok=True)
    with open(ROOT / "docs" / "findings.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=lambda o: None if isinstance(o, float) and not np.isfinite(o) else o)
    return results


if __name__ == "__main__":
    res = main()
    pop = res["population"]
    print(f"Accounts: {res['accounts_total']} total, {res['accounts_eligible_positive_inflow']} eligible (I>0)")
    print(f"Baseline: {pop['baseline_no_shortfall_pct']:.1f}% have no monthly shortfall at all")
    print(f"Layoff 55%: {pop['layoff55_survive6_pct']:.1f}% last 6 months ({pop['layoff55_survive6_n']}); "
          f"{pop['layoff55_no_shortfall_pct']:.1f}% have no shortfall even at 55%; median finite runway {pop['layoff55_median_runway_finite']:.1f}")
    print(f"Combined: {pop['combined_survive6_pct']:.1f}% last 6 months; survivors pushed under 6 by +15% bills: "
          f"{pop['layoff_survivors_pushed_under6_by_bills']} ({pop['layoff_survivors_pushed_under6_by_bills_pct']:.1f}% of survivors)")
    print(f"Spearman B vs runway: {pop['spearman_buffer_vs_runway_layoff']:.3f}; spend ratio vs runway: {pop['spearman_spendratio_vs_runway_layoff']:.3f}")
    print(f"Observed negative-balance ever: {pop['observed_any_negative_balance_pct']:.1f}%")
    vd = res["variance_decomposition_layoff55"]
    print(f"Var decomposition (n={vd['n_accounts_with_shortfall']}): buffer {vd['share_from_buffer']:.2f}, gap {vd['share_from_gap']:.2f}, cov {vd['share_from_covariance']:.2f}, corr {vd['corr_logB_logGap']:.2f}")
    for name, st in res["runs"].items():
        print(f"[{name}] elig={st['eligible']} pairs={st['pairs']} unmatched={st['unmatched']} unequalB={st['pairs_unequal_buffer']} "
              f"reversals={st['reversals']} ({(st['reversal_pct_of_pairs'] or 0):.1f}%) expected={st['expected_order']} "
              f"bothfail={st['both_fail']} bothok={st['both_survive']} rev/discordant={(st['reversal_pct_of_discordant'] or 0):.1f}% "
              f"medBgap={st['median_buffer_gap_in_reversals']} medSgap={st['median_spending_gap_in_reversals']}")
    print("Representative pair:", json.dumps(res["representative_pair"], indent=1, default=str))
